import type { BurstRequestResult, OutcomeCategory, Verdict } from "./types";

export type AnalyzeOptions = {
  /**
   * When true (default), identical success bodies are read as the server
   * deduplicating duplicates. Set to false for counter-style targets where
   * identical responses mean lost updates instead.
   */
  identicalMeansDedup?: boolean;
};

export function categorize(result: BurstRequestResult): OutcomeCategory {
  if (result.status === null) return "failed";
  if (result.status >= 200 && result.status < 300) return "success";
  if (result.status === 409 || result.status === 429) return "conflict";
  if (result.status >= 400 && result.status < 500) return "rejected";
  return "server_error";
}

const ID_FIELD_REGEX = /"([A-Za-z0-9_-]*id[A-Za-z0-9_-]*)"\s*:\s*(?:"([^"]{1,80})"|(-?\d+))/gi;
const UUID_REGEX = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/** Pull resource ids (order_id, id, uuids, …) out of a response body. */
export function extractResourceIds(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(ID_FIELD_REGEX)) {
    const value = match[2] ?? match[3];
    if (value) found.add(value);
  }
  for (const match of body.matchAll(UUID_REGEX)) {
    found.add(match[0]);
  }
  return [...found].slice(0, 12);
}

function plural(n: number, word: string, suffix = "s"): string {
  return `${n} ${word}${n === 1 ? "" : suffix}`;
}

export function analyzeBurst(
  results: BurstRequestResult[],
  options: AnalyzeOptions = {},
): Verdict {
  const { identicalMeansDedup = true } = options;

  const categories = results.map(categorize);
  const successes = results.filter((_, i) => categories[i] === "success");
  const conflicts = categories.filter((c) => c === "conflict").length;
  const rejected = categories.filter((c) => c === "rejected").length;
  const serverErrors = categories.filter((c) => c === "server_error").length;
  const failed = categories.filter((c) => c === "failed").length;

  const base = {
    successes: successes.length,
    conflicts,
    rejected,
    serverErrors,
    failed,
    uniqueIds: [],
    successSpreadMs: 0,
    deduplicated: false,
  };

  if (results.length === 0) {
    return {
      ...base,
      kind: "inconclusive",
      headline: "Nothing was dispatched",
      emoji: "🟡",
      summary: "No requests were sent, so there is nothing to judge.",
      detail: "Pick a target endpoint, choose a burst size and hit Run.",
      reasons: [],
    };
  }

  const allFailed = failed === results.length;
  if (allFailed) {
    return {
      ...base,
      kind: "inconclusive",
      headline: "Inconclusive — every request failed",
      emoji: "🟡",
      summary: "None of the requests reached the endpoint, so no verdict is possible yet.",
      detail:
        'Every request died before a response came back. With "Direct from browser" dispatch this is almost always CORS: browsers refuse cross-origin calls unless the target sends permissive Access-Control-Allow-* headers. Switch the dispatch mode to "Via proxy" and run again — the request then leaves from this app\'s server, where CORS does not apply.',
      reasons: [
        plural(failed, "request") + " failed with a network error before any response was received",
        "Browser CORS policy or an unreachable host blocked the burst",
      ],
    };
  }

  if (successes.length === 0) {
    if (conflicts > 0) {
      return {
        ...base,
        kind: "protected",
        headline: "Protected — duplicates rejected",
        emoji: "🟢",
        summary: `No state was changed more than once: ${plural(conflicts, "duplicate")} were turned away with ${conflicts === 1 ? "a" : ""} 409/429 response${conflicts === 1 ? "" : "s"}.`,
        detail:
          "The endpoint refused every concurrent duplicate with a conflict (409) or rate-limit (429) response instead of processing it. However the guard is implemented — a lock, a unique constraint, an idempotency key — it held up under the burst: exactly one caller (or nobody, if the resource already existed) got through.",
        reasons: [
          `0 of ${results.length} requests produced a 2xx success`,
          `${plural(conflicts, "request")} returned 409/429, signalling the server detected the duplicate`,
        ],
      };
    }
    return {
      ...base,
      kind: "inconclusive",
      headline: "Inconclusive — nothing succeeded",
      emoji: "🟡",
      summary: "Every request was rejected or errored, so the race path was never exercised.",
      detail:
        "The verdict engine needs at least one 2xx (or one conflict) to judge idempotency. Re-check the URL, method, headers and body — for example a missing Authorization header or an invalid payload can 401/400 every request before the interesting logic runs.",
      reasons: [
        `${plural(rejected, "request")} rejected with 4xx, ${plural(serverErrors, "request")} failed with 5xx`,
        "No 2xx and no 409/429 observed — the target never reached its write path",
      ],
    };
  }

  if (successes.length === 1) {
    if (serverErrors >= results.length - 1 && serverErrors > 0) {
      return {
        ...base,
        kind: "inconclusive",
        headline: "Inconclusive — endpoint buckled under load",
        emoji: "🟡",
        summary: `Only one request succeeded; the other ${serverErrors} crashed with 5xx responses.`,
        detail:
          "A wave of 500s under concurrency points at unstable error handling rather than a clean verdict. Fix the crash first, then rerun: errors that abort mid-write can mask or mimic race conditions.",
        reasons: [
          "1 success but " + plural(serverErrors, "request") + " returned 5xx",
          "Mass failures hide the real concurrency behaviour",
        ],
      };
    }
    const rest = results.length - 1;
    return {
      ...base,
      kind: "protected",
      headline: "Idempotent / Protected",
      emoji: "🟢",
      summary: `Exactly one request changed state; the other ${rest} ${rest === 1 ? "was" : "were"} handled as conflicts, rejections or duplicates.`,
      detail:
        "Under a simultaneous burst the server allowed a single state change and dealt with the duplicates deterministically — via 409 Conflict, 429 rate limiting, or by returning one canonical result. This is what well-behaved write endpoints look like: safe to retry, safe to double-click, safe behind flaky networks.",
      reasons: [
        `${plural(successes.length, "success")} 2xx response`,
        conflicts > 0 ? `${plural(conflicts, "request")} rejected with 409/429` : null,
        rejected > 0 ? `${plural(rejected, "request")} rejected with other 4xx` : null,
        "No duplicated state change was possible",
      ].filter((r): r is string => r !== null),
    };
  }

  // Two or more successes: compare bodies.
  const trimmedBodies = successes.map((r) => r.body.trim());
  const allIdentical = trimmedBodies.every((b) => b === trimmedBodies[0]);
  const spread =
    Math.max(...successes.map((r) => r.receivedAt)) -
    Math.min(...successes.map((r) => r.receivedAt));
  const uniqueIds = [...new Set(successes.flatMap((r) => extractResourceIds(r.body)))];

  if (allIdentical && identicalMeansDedup) {
    return {
      ...base,
      uniqueIds,
      successSpreadMs: spread,
      deduplicated: true,
      kind: "protected",
      headline: "Protected — deduplicated",
      emoji: "🟢",
      summary: `All ${successes.length} concurrent duplicates got byte-identical responses for the same resource.`,
      detail:
        "The server collapsed the burst onto one shared result: every request returned the same payload, which is the signature of deduplication (idempotency keys, request hashing or single-flight caching). Each duplicate was answered as a replay of the first instead of being processed independently.",
      reasons: [
        `${plural(successes.length, "request")} succeeded, but every response body was identical`,
        `Responses arrived within ${spread}ms of each other — one canonical result, not independent writes`,
      ],
    };
  }

  return {
    ...base,
    uniqueIds,
    successSpreadMs: spread,
    deduplicated: false,
    kind: "vulnerable",
    headline: "Vulnerable to race conditions",
    emoji: "🔴",
    summary: `${plural(successes.length, "request")} succeeded with ${plural(uniqueIds.length || successes.length, "distinct resource ID", "s")} inside a ${spread}ms window — every duplicate was processed as its own write.`,
    detail:
      "Your endpoint accepted simultaneous duplicate submissions and processed each one independently. Every request ran its read → validate → write sequence without coordination, so each one saw \"no existing record\" at check time and created its own resource — a classic TOCTOU (time-of-check to time-of-use) race. In production this means double charges, duplicate orders, double-spent coupons or lost counter updates whenever users double-click, retry on a timeout, or a webhook fires twice.",
    reasons: [
      `${plural(successes.length, "request")} returned 2xx where idempotent behaviour allows at most one`,
      uniqueIds.length > 1
        ? `${plural(uniqueIds.length, "distinct ID")} created in the same burst: ${uniqueIds.slice(0, 5).join(", ")}${uniqueIds.length > 5 ? " …" : ""}`
        : "Success responses differ, so independent state changes occurred",
      `All successful writes completed within ${spread}ms — a genuine concurrent window, not sequential retries`,
    ],
  };
}
