import { createFileRoute } from "@tanstack/react-router";

// Built-in demo targets for first-run visitors. Each scenario exists as a
// deliberately vulnerable variant (accepts every concurrent request) and a
// protected variant (exactly one state change, duplicates get 409/dedup).
//
//   /api/public/mock/{checkout|coupon|wallet|counter}/{vulnerable|protected}

const SCENARIOS = ["checkout", "coupon", "wallet", "counter"] as const;
type Scenario = (typeof SCENARIOS)[number];
type Mode = "vulnerable" | "protected";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function freshId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function simpleHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `h${(h >>> 0).toString(36)}`;
}

const KEY_FIELDS: Record<Scenario, string> = {
  checkout: "cart_id",
  coupon: "coupon_code",
  wallet: "reference",
  counter: "counter",
};

function deriveIdempotencyKey(scenario: Scenario, bodyText: string, request: Request): string {
  const headerKey = request.headers.get("idempotency-key");
  let field = "";
  try {
    const parsed = JSON.parse(bodyText) as Record<string, unknown>;
    const value = parsed[KEY_FIELDS[scenario]];
    if (typeof value === "string") field = value;
  } catch {
    // non-JSON body — fall through to hash
  }
  return headerKey ?? field ?? simpleHash(bodyText);
}

const ID_PREFIX: Record<Scenario, string> = {
  checkout: "ord",
  coupon: "clm",
  wallet: "txn",
  counter: "wkr",
};

function conflictPayload(scenario: Scenario, existingId: string): Record<string, unknown> {
  switch (scenario) {
    case "checkout":
      return {
        error: "order_conflict",
        message: "An order for this cart already exists. Nothing was charged again.",
        existing_order_id: existingId,
      };
    case "coupon":
      return {
        error: "coupon_already_claimed",
        message: "This coupon was claimed moments ago — one claim per user.",
        existing_claim_id: existingId,
      };
    case "wallet":
      return {
        error: "duplicate_reference",
        message: "A transfer with this reference already completed. No double debit.",
        existing_transfer_id: existingId,
      };
    case "counter":
      return { error: "unexpected_conflict" };
  }
}

function createdPayload(scenario: Scenario, id: string, bodyText: string): Record<string, unknown> {
  switch (scenario) {
    case "checkout": {
      let total = 0;
      try {
        total = Number((JSON.parse(bodyText) as { total_cents?: number }).total_cents) || 0;
      } catch {
        total = 0;
      }
      return {
        order_id: id,
        status: "confirmed",
        charge_id: freshId("chg"),
        amount_cents: total,
        created_at: new Date().toISOString(),
      };
    }
    case "coupon":
      return {
        claim_id: id,
        coupon_code: "WELCOME10",
        discount_cents: 10,
        claimed_at: new Date().toISOString(),
      };
    case "wallet":
      return { transfer_id: id, status: "completed", amount_cents: 5000 };
    case "counter":
      return { counter: "page_views", value: 1, processed_by: id };
  }
}

export const Route = createFileRoute("/api/public/mock/$")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const splat = (params as { _splat?: string })._splat ?? "";
        const [scenarioRaw, modeRaw] = splat.split("/");
        const scenario = SCENARIOS.find((s) => s === scenarioRaw);
        const mode: Mode | null = modeRaw === "vulnerable" || modeRaw === "protected" ? modeRaw : null;

        if (!scenario || !mode) {
          return Response.json(
            {
              error: "unknown_mock_scenario",
              hint: "Use /api/public/mock/{checkout|coupon|wallet|counter}/{vulnerable|protected}",
            },
            { status: 404 },
          );
        }

        const bodyText = await request.text().catch(() => "");
        // Simulate realistic server work so the race window is wide enough.
        await sleep(20 + Math.random() * 130);

        const { claimFirst } = await import("@/lib/mock-state.server");

        if (mode === "vulnerable") {
          // Intentionally unprotected: every concurrent request is processed
          // independently, producing its own resource id / worker value.
          const payload = createdPayload(scenario, freshId(ID_PREFIX[scenario]), bodyText);
          if (scenario === "counter") {
            payload["note"] =
              "Lost update: every concurrent request read the same base value and wrote its own — increments were silently dropped.";
          }
          return Response.json({ ...payload, _demo: "vulnerable — no protection" }, { status: 200 });
        }

        const idempotencyKey = deriveIdempotencyKey(scenario, bodyText, request);
        const id = freshId(ID_PREFIX[scenario]);
        const { isFirst, entry } = claimFirst(`${scenario}:${idempotencyKey}`, id, bodyText);

        if (scenario === "counter") {
          // Atomic increment with dedup: every duplicate sees the same final value.
          return Response.json(
            { counter: "page_views", value: 1, deduplicated: true, _demo: "protected" },
            { status: 200 },
          );
        }

        if (isFirst) {
          return Response.json(
            { ...createdPayload(scenario, id, bodyText), _demo: "protected — first write" },
            { status: 201 },
          );
        }

        return Response.json(
          { ...conflictPayload(scenario, entry.firstId), _demo: "protected — duplicate rejected" },
          { status: 409 },
        );
      },
      GET: async ({ params }) => {
        const splat = (params as { _splat?: string })._splat ?? "";
        return Response.json(
          {
            endpoint: "built-in mock target",
            usage: `POST /api/public/mock/{${SCENARIOS.join("|")}}/{vulnerable|protected}`,
            requested: splat,
          },
          { status: 200 },
        );
      },
    },
  },
});
