import type { BurstRequestResult, TestConfig } from "./types";

const MAX_EXPORT_BODY = 2000;

function headersObject(config: TestConfig): Record<string, string> {
  const out: Record<string, string> = {};
  for (const header of config.headers) {
    const key = header.key.trim();
    if (!key) continue;
    out[key] = header.value;
  }
  return out;
}

/**
 * Fires the exact burst of identical requests simultaneously and returns
 * per-request timings to the millisecond. Every task settles — network
 * failures are captured as results, never thrown.
 */
export async function runBurst(config: TestConfig): Promise<BurstRequestResult[]> {
  const headers = headersObject(config);
  const hasBody = config.method !== "GET" && config.body.trim().length > 0;
  // Relative targets (the built-in mock endpoints) must be absolute for the proxy.
  const absoluteUrl =
    config.mode === "proxy" && !/^https?:\/\//i.test(config.url)
      ? `${window.location.origin}${config.url}`
      : config.url;

  const tasks = Array.from({ length: config.concurrency }, (_, i): Promise<BurstRequestResult> =>
    (async () => {
      const dispatchAt = Date.now();
      const t0 = performance.now();
      try {
        let status: number | null = null;
        let body = "";
        let error: string | undefined;

        if (config.mode === "proxy") {
          const res = await fetch("/api/public/proxy", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              method: config.method,
              url: absoluteUrl,
              headers,
              body: hasBody ? config.body : undefined,
            }),
          });
          const payload = (await res.json()) as {
            status?: number | null;
            body?: string;
            error?: string;
          };
          status = typeof payload.status === "number" ? payload.status : null;
          body = payload.body ?? "";
          error = payload.error;
        } else {
          const init: RequestInit = { method: config.method, headers };
          if (hasBody) init.body = config.body;
          const res = await fetch(config.url, init);
          status = res.status;
          body = (await res.text()).slice(0, MAX_EXPORT_BODY * 4);
        }

        const receivedAt = Date.now();
        const result: BurstRequestResult = {
          index: i + 1,
          dispatchAt,
          receivedAt,
          durationMs: Math.round(performance.now() - t0),
          status,
          body,
          viaProxy: config.mode === "proxy",
        };
        if (error !== undefined) result.error = error;
        return result;
      } catch (thrown) {
        const receivedAt = Date.now();
        const message =
          thrown instanceof Error
            ? thrown.message === "Failed to fetch"
              ? "Blocked — likely by browser CORS policy"
              : thrown.message
            : "Request failed";
        const result: BurstRequestResult = {
          index: i + 1,
          dispatchAt,
          receivedAt,
          durationMs: Math.round(performance.now() - t0),
          status: null,
          body: "",
          error: message,
          viaProxy: config.mode === "proxy",
        };
        return result;
      }
    })(),
  );

  // Created synchronously in one tick, so dispatch happens ~simultaneously.
  return Promise.all(tasks);
}
