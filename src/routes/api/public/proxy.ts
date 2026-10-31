import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// CORS-safe single-request proxy: the browser fires its burst through this
// endpoint so third-party APIs are reachable without per-origin CORS setup.

const proxySchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH"]),
  url: z.string().url(),
  headers: z.record(z.string().max(256), z.string().max(4096)).optional(),
  body: z.string().max(65_536).optional(),
});

const MAX_RESPONSE_BYTES = 20_000;
const TIMEOUT_MS = 15_000;

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal"))
    return true;
  if (h === "::1" || h === "0.0.0.0" || h === "::") return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h))
    return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^(fc|fd|fe80)/.test(h)) return true; // IPv6 private/link-local (rough)
  return false;
}

const HOP_BY_HOP = new Set(["host", "content-length", "connection", "keep-alive", "transfer-encoding"]);

type ProxyEnvelope = {
  status: number | null;
  body: string;
  truncated: boolean;
  dispatchAt: number;
  receivedAt: number;
  durationMs: number;
  error?: string;
};

function envelope(payload: ProxyEnvelope, t0: number): Response {
  return Response.json({ ...payload, durationMs: payload.durationMs ?? Date.now() - t0 });
}

export const Route = createFileRoute("/api/public/proxy")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const t0 = Date.now();

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return Response.json({ error: "invalid_json_body" }, { status: 400 });
        }

        const parsed = proxySchema.safeParse(raw);
        if (!parsed.success) {
          return Response.json(
            { error: "invalid_input", issues: parsed.error.issues.map((i) => i.message) },
            { status: 400 },
          );
        }

        const { method, url, headers, body } = parsed.data;

        let target: URL;
        try {
          target = new URL(url);
        } catch {
          return Response.json({ error: "invalid_url" }, { status: 400 });
        }
        if (target.protocol !== "https:" && target.protocol !== "http:") {
          return Response.json({ error: "unsupported_protocol" }, { status: 400 });
        }
        if (isBlockedHost(target.hostname)) {
          return Response.json(
            { error: "blocked_host", message: "Local and private network addresses are not allowed." },
            { status: 400 },
          );
        }

        const outboundHeaders = new Headers();
        for (const [key, value] of Object.entries(headers ?? {})) {
          if (HOP_BY_HOP.has(key.toLowerCase())) continue;
          outboundHeaders.set(key, value);
        }

        const init: RequestInit = { method, headers: outboundHeaders, redirect: "follow" };
        if (method !== "GET" && body !== undefined) init.body = body;

        const dispatchAt = Date.now();
        try {
          const response = await fetch(target.toString(), {
            ...init,
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          let text = await response.text();
          let truncated = false;
          if (text.length > MAX_RESPONSE_BYTES) {
            text = text.slice(0, MAX_RESPONSE_BYTES);
            truncated = true;
          }
          const receivedAt = Date.now();
          return Response.json({
            status: response.status,
            body: text,
            truncated,
            dispatchAt,
            receivedAt,
            durationMs: receivedAt - dispatchAt,
          });
        } catch (error) {
          const receivedAt = Date.now();
          const message =
            error instanceof Error
              ? error.name === "TimeoutError"
                ? `Target did not respond within ${TIMEOUT_MS / 1000}s`
                : error.message
              : "Outbound request failed";
          return Response.json({
            status: null,
            body: "",
            truncated: false,
            dispatchAt,
            receivedAt,
            durationMs: receivedAt - dispatchAt,
            error: message,
          });
        }
      },
    },
  },
});
