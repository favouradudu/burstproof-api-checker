// Shared, in-memory demo state for the built-in mock endpoints.
// Deliberately server-only (*.server.ts) and ephemeral: this is a sandbox for
// demonstrating race behaviour, not durable storage.

export type MockEntry = {
  hits: number;
  firstId: string;
  firstBody: string;
  createdAt: number;
};

const store = new Map<string, MockEntry>();

export function claimFirst(
  key: string,
  id: string,
  body: string,
): { isFirst: boolean; entry: MockEntry } {
  const existing = store.get(key);
  if (existing) {
    existing.hits += 1;
    return { isFirst: false, entry: existing };
  }
  const entry: MockEntry = { hits: 1, firstId: id, firstBody: body, createdAt: Date.now() };
  store.set(key, entry);
  return { isFirst: true, entry };
}

export function resetMockStore(): void {
  store.clear();
}
