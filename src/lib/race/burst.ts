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
              url: config.url,
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
          const res = await fetch(config.url, {
            method: config.method,
            headers,
            body: hasBody ? config.body : undefined,
          });
          status = res.status;
          body = (await res.text()).slice(0, MAX_EXPORT_BODY * 4);
        }

        const receivedAt = Date.now();
        return {
          index: i + 1,
          dispatchAt,
          receivedAt,
          durationMs: Math.round(performance.now() - t0),
          status,
          body,
          error,
          viaProxy: config.mode === "proxy",
        };
      } catch (thrown) {
        const receivedAt = Date.now();
        return {
          index: i + 1,
          dispatchAt,
          receivedAt,
          durationMs: Math.round(performance.now() - t0),
          status: null,
          body: "",
          error:
            thrown instanceof Error
              ? thrown.message === "Failed to fetch"
                ? "Blocked — likely by browser CORS policy"
                : thrown.message
              : "Request failed",
          viaProxy: config.mode === "proxy",
        };
      }
    })(),
  );

  // Created synchronously in one tick, so dispatch happens ~simultaneously.
  return Promise.all(tasks);
}
