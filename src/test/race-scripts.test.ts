import { describe, expect, it } from "vitest";

import { buildCiWorkflow, buildCurlScript } from "@/lib/race/export-scripts";
import { identicalMeansDedupFor, PLAYGROUND_TARGETS } from "@/lib/race/targets";
import type { TestConfig } from "@/lib/race/types";

function config(partial: Partial<TestConfig> = {}): TestConfig {
  return {
    method: "POST",
    url: "https://staging.acme.com/api/orders",
    headers: [{ key: "Content-Type", value: "application/json" }],
    body: '{"cart_id":"cart_1"}',
    concurrency: 12,
    mode: "proxy",
    idempotency: "raw",
    idempotencyKey: null,
    ...partial,
  };
}

describe("cURL / CI export", () => {
  it("matches the configured burst size, endpoint and method", () => {
    const script = buildCurlScript(config({ concurrency: 12 }));
    expect(script).toContain("seq 1 12");
    expect(script).toContain("https://staging.acme.com/api/orders");
    expect(script).toContain("-X POST");
    expect(script).toContain('{"cart_id":"cart_1"}');
  });

  it("omits the method flag and body for GET bursts", () => {
    const script = buildCurlScript(config({ method: "GET", body: "" }));
    expect(script).not.toContain("-X ");
    expect(script).not.toContain("--data");
  });

  it("redacts secret header values into an env var instead of the literal token", () => {
    const script = buildCurlScript(
      config({
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Authorization", value: "Bearer super-secret-token" },
        ],
      }),
    );
    expect(script).toContain("${TARGET_AUTH}");
    expect(script).not.toContain("super-secret-token");
    expect(script).toContain("export TARGET_AUTH");
  });

  it("sends the shared idempotency key in shared mode and no key in raw mode", () => {
    const shared = buildCurlScript(
      config({
        idempotency: "shared",
        idempotencyKey: "11111111-2222-3333-4444-555555555555",
        headers: [],
      }),
    );
    expect(shared).toContain("Idempotency-Key: 11111111-2222-3333-4444-555555555555");

    const raw = buildCurlScript(
      config({
        idempotency: "raw",
        idempotencyKey: "11111111-2222-3333-4444-555555555555",
        headers: [{ key: "Idempotency-Key", value: "stale-key" }],
      }),
    );
    expect(raw).not.toContain("Idempotency-Key");
  });

  it("emits a manual GitHub Actions job running the same burst", () => {
    const workflow = buildCiWorkflow(config({ concurrency: 12 }));
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).toContain("runs-on: ubuntu-latest");
    expect(workflow).toContain("seq 1 12");
    expect(workflow).toContain("wait");
  });

  it("maps the auth env var to a GitHub secret in the workflow", () => {
    const workflow = buildCiWorkflow(
      config({ headers: [{ key: "Authorization", value: "Bearer x" }] }),
    );
    expect(workflow).toContain("${{ secrets.TARGET_AUTH }}");
  });
});

describe("playground targets", () => {
  it("lists real public endpoints with valid JSON bodies", () => {
    for (const target of PLAYGROUND_TARGETS) {
      expect(target.url).toMatch(/^https:\/\//);
      if (target.method !== "GET" && target.body.trim()) {
        expect(() => JSON.parse(target.body)).not.toThrow();
      }
    }
  });

  it("reads identical bodies as independent writes for the JSONPlaceholder sandbox", () => {
    const target = PLAYGROUND_TARGETS.find((t) => t.id === "jsonplaceholder-create")!;
    const verdictReading = identicalMeansDedupFor(config(target));
    expect(verdictReading).toBe(false);
  });

  it("falls back to preset and default readings by URL", () => {
    // Counter preset treats identical bodies as lost updates.
    expect(identicalMeansDedupFor(config({ url: "/api/public/mock/counter/protected" }))).toBe(
      false,
    );
    // Checkout preset and unknown targets use the dedup reading.
    expect(identicalMeansDedupFor(config({ url: "/api/public/mock/checkout/vulnerable" }))).toBe(
      true,
    );
    expect(identicalMeansDedupFor(config({ url: "https://example.com/api/thing" }))).toBe(true);
  });
});
