import { PRESETS } from "./presets";
import type { HttpMethod, KeyValueHeader, TestConfig } from "./types";

export type PlaygroundTarget = {
  id: string;
  /** Button label */
  label: string;
  /** Short blurb shown on the button */
  blurb: string;
  /** Longer note shown when the target is active — sets expectations for the verdict */
  note: string;
  method: HttpMethod;
  url: string;
  headers: KeyValueHeader[];
  body: string;
  identicalMeansDedup: boolean;
};

/** Real, public endpoints anyone can burst against in seconds — no setup. */
export const PLAYGROUND_TARGETS: PlaygroundTarget[] = [
  {
    id: "jsonplaceholder-create",
    label: "JSONPlaceholder",
    blurb: "POST /posts — sandbox CRUD",
    note: "This sandbox fakes persistence: every POST returns 201 with the same dummy id, so you get a guaranteed multi-success burst read as independent writes (no dedup).",
    method: "POST",
    url: "https://jsonplaceholder.typicode.com/posts",
    headers: [{ key: "Content-Type", value: "application/json" }],
    body: JSON.stringify(
      { title: "burstproof race test", body: "concurrent duplicate submit", userId: 1 },
      null,
      2,
    ),
    identicalMeansDedup: false,
  },
  {
    id: "httpbin-echo",
    label: "httpbin echo",
    blurb: "POST /post — echoes payload",
    note: "Echo server: every request is answered with your payload back. Identical bodies are inherent to an echo — use it to confirm all N requests actually land and to read real latencies.",
    method: "POST",
    url: "https://httpbin.org/post",
    headers: [{ key: "Content-Type", value: "application/json" }],
    body: JSON.stringify({ action: "charge", cart_id: "cart_8f3k2", amount_cents: 2900 }, null, 2),
    identicalMeansDedup: true,
  },
  {
    id: "httpbin-uuid",
    label: "httpbin uuid",
    blurb: "GET /uuid — fresh per call",
    note: "Mints a fresh UUID per call, so every success carries a distinct resource ID — expected for this endpoint, but handy to watch distinct-ID detection live.",
    method: "GET",
    url: "https://httpbin.org/uuid",
    headers: [],
    body: "",
    identicalMeansDedup: false,
  },
];

/** The playground target matching this config, if the user picked one. */
export function activePlaygroundTarget(config: TestConfig): PlaygroundTarget | null {
  return PLAYGROUND_TARGETS.find((t) => t.method === config.method && t.url === config.url) ?? null;
}

/**
 * How the verdict engine should read identical success bodies for this config:
 * playground targets and counter-style presets report fresh state per call, so
 * identical bodies there mean independent writes, not deduplication.
 */
export function identicalMeansDedupFor(config: TestConfig): boolean {
  const playground = activePlaygroundTarget(config);
  if (playground) return playground.identicalMeansDedup;
  const preset = PRESETS.find(
    (p) => p.vulnerableUrl === config.url || p.protectedUrl === config.url,
  );
  if (preset) return preset.identicalMeansDedup;
  return true;
}

export function playgroundToConfig(
  target: PlaygroundTarget,
  base: Pick<TestConfig, "concurrency" | "mode" | "idempotency" | "idempotencyKey">,
): Pick<
  TestConfig,
  "method" | "url" | "headers" | "body" | "concurrency" | "mode" | "idempotency" | "idempotencyKey"
> {
  return {
    method: target.method,
    url: target.url,
    headers: target.headers.map((header) => ({ ...header })),
    body: target.body,
    concurrency: base.concurrency,
    mode: base.mode,
    idempotency: base.idempotency,
    idempotencyKey: base.idempotencyKey,
  };
}
