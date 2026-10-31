import type { HttpMethod, KeyValueHeader } from "./types";

export type Preset = {
  id: string;
  label: string;
  blurb: string;
  method: HttpMethod;
  vulnerableUrl: string;
  protectedUrl: string;
  body: string;
  headers: KeyValueHeader[];
  /**
   * Counter-style endpoints return identical bodies when they suffer lost
   * updates — there identical success bodies mean a bug, not deduplication.
   */
  identicalMeansDedup: boolean;
};

export const MOCK_BASE = "/api/public/mock";

export const PRESETS: Preset[] = [
  {
    id: "checkout",
    label: "E-commerce Checkout",
    blurb: "Double-submitted order — duplicate charges",
    method: "POST",
    vulnerableUrl: `${MOCK_BASE}/checkout/vulnerable`,
    protectedUrl: `${MOCK_BASE}/checkout/protected`,
    body: JSON.stringify(
      {
        cart_id: "cart_8f3k2",
        items: [{ sku: "TS-042", qty: 1, price_cents: 2900 }],
        total_cents: 2900,
        currency: "USD",
      },
      null,
      2,
    ),
    headers: [{ key: "Content-Type", value: "application/json" }],
    identicalMeansDedup: true,
  },
  {
    id: "coupon",
    label: "Coupon Claim",
    blurb: "One-per-user coupon claimed twice",
    method: "POST",
    vulnerableUrl: `${MOCK_BASE}/coupon/vulnerable`,
    protectedUrl: `${MOCK_BASE}/coupon/protected`,
    body: JSON.stringify({ coupon_code: "WELCOME10", cart_id: "cart_8f3k2" }, null, 2),
    headers: [{ key: "Content-Type", value: "application/json" }],
    identicalMeansDedup: true,
  },
  {
    id: "wallet",
    label: "Wallet Transfer",
    blurb: "Retry after timeout — double debit",
    method: "POST",
    vulnerableUrl: `${MOCK_BASE}/wallet/vulnerable`,
    protectedUrl: `${MOCK_BASE}/wallet/protected`,
    body: JSON.stringify(
      {
        from_account: "acc_A1",
        to_account: "acc_B2",
        amount_cents: 5000,
        reference: "txn_2026_1031",
      },
      null,
      2,
    ),
    headers: [{ key: "Content-Type", value: "application/json" }],
    identicalMeansDedup: true,
  },
  {
    id: "counter",
    label: "Counter Increment",
    blurb: "Lost updates under concurrent increments",
    method: "POST",
    vulnerableUrl: `${MOCK_BASE}/counter/vulnerable`,
    protectedUrl: `${MOCK_BASE}/counter/protected`,
    body: JSON.stringify({ counter: "page_views", delta: 1 }, null, 2),
    headers: [{ key: "Content-Type", value: "application/json" }],
    identicalMeansDedup: false,
  },
];

export type MockMode = "vulnerable" | "protected";

export function mockModeOf(url: string): MockMode | null {
  if (/\/vulnerable\/?$/.test(url)) return "vulnerable";
  if (/\/protected\/?$/.test(url)) return "protected";
  return null;
}

export function swapMockMode(url: string, mode: MockMode): string {
  return url.replace(/\/(vulnerable|protected)(\/?)$/, `/${mode}$2`);
}
