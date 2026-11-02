export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH";

export type DispatchMode = "proxy" | "direct";

/**
 * How the burst handles the Idempotency-Key header:
 * - "raw" — no key is sent (any configured one is stripped)
 * - "shared" — one UUID is sent on every request in the burst
 */
export type IdempotencyMode = "raw" | "shared";

export type KeyValueHeader = { key: string; value: string };

export type TestConfig = {
  method: HttpMethod;
  url: string;
  headers: KeyValueHeader[];
  body: string;
  concurrency: number;
  mode: DispatchMode;
  idempotency: IdempotencyMode;
  idempotencyKey: string | null;
};

export type BurstRequestResult = {
  /** 1-based position in the burst */
  index: number;
  /** epoch ms when the request left the browser */
  dispatchAt: number;
  /** epoch ms when the response (or error) was back */
  receivedAt: number;
  durationMs: number;
  /** HTTP status, or null on network error */
  status: number | null;
  body: string;
  error?: string;
  viaProxy: boolean;
};

export type OutcomeCategory = "success" | "conflict" | "rejected" | "server_error" | "failed";

export type VerdictKind = "protected" | "vulnerable" | "inconclusive";

export type Verdict = {
  kind: VerdictKind;
  headline: string;
  emoji: string;
  /** one-line plain-English conclusion */
  summary: string;
  /** longer explanation of why the observed behaviour happened */
  detail: string;
  reasons: string[];
  successes: number;
  conflicts: number;
  rejected: number;
  serverErrors: number;
  failed: number;
  uniqueIds: string[];
  /** spread between first and last successful response, ms */
  successSpreadMs: number;
  /** true when all success bodies were byte-identical (dedup) */
  deduplicated: boolean;
};
