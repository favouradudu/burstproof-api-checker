import { describe, expect, it } from "vitest";

import { analyzeBurst, extractResourceIds } from "@/lib/race/analysis";
import type { BurstRequestResult } from "@/lib/race/types";

function result(partial: Partial<BurstRequestResult>, index = 1): BurstRequestResult {
  return {
    index,
    dispatchAt: 1000,
    receivedAt: 1040,
    durationMs: 40,
    status: 201,
    body: "",
    viaProxy: true,
    ...partial,
  };
}

describe("race verdict", () => {
  it("flags one success plus 409 conflicts as protected", () => {
    const verdict = analyzeBurst([
      result({ status: 201, body: '{"order_id":"ord_a"}' }, 1),
      result({ status: 409, body: '{"error":"order_conflict"}' }, 2),
      result({ status: 409, body: '{"error":"order_conflict"}' }, 3),
    ]);
    expect(verdict.kind).toBe("protected");
    expect(verdict.successes).toBe(1);
    expect(verdict.conflicts).toBe(2);
  });

  it("flags multiple successes with distinct ids as vulnerable", () => {
    const verdict = analyzeBurst([
      result({ body: '{"order_id":"ord_a"}' }, 1),
      result({ body: '{"order_id":"ord_b"}' }, 2),
      result({ body: '{"order_id":"ord_c"}' }, 3),
    ]);
    expect(verdict.kind).toBe("vulnerable");
    expect(verdict.uniqueIds).toEqual(["ord_a", "ord_b", "ord_c"]);
  });

  it("treats byte-identical success bodies as deduplicated and protected", () => {
    const verdict = analyzeBurst([
      result({ status: 200, body: '{"value":1}' }, 1),
      result({ status: 200, body: '{"value":1}' }, 2),
    ]);
    expect(verdict.kind).toBe("protected");
    expect(verdict.deduplicated).toBe(true);
  });

  it("treats identical success bodies as lost updates for counter-style targets", () => {
    const verdict = analyzeBurst(
      [
        result({ status: 200, body: '{"value":1}' }, 1),
        result({ status: 200, body: '{"value":1}' }, 2),
      ],
      { identicalMeansDedup: false },
    );
    expect(verdict.kind).toBe("vulnerable");
  });

  it("is inconclusive when every request failed (e.g. CORS)", () => {
    const verdict = analyzeBurst([
      result({ status: null, error: "Failed to fetch" }, 1),
      result({ status: null, error: "Failed to fetch" }, 2),
    ]);
    expect(verdict.kind).toBe("inconclusive");
    expect(verdict.failed).toBe(2);
  });

  it("is protected when every duplicate is rejected with 409 and none succeed", () => {
    const verdict = analyzeBurst([
      result({ status: 409 }, 1),
      result({ status: 409 }, 2),
      result({ status: 429 }, 3),
    ]);
    expect(verdict.kind).toBe("protected");
  });

  it("extracts resource ids from response bodies", () => {
    const ids = extractResourceIds('{"order_id":"ord_9","charge_id":"chg_1","n":2}');
    expect(ids).toContain("ord_9");
    expect(ids).toContain("chg_1");
    expect(ids).not.toContain("2");
  });
});
