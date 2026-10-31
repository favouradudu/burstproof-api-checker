export function validateRequestBody(body: string, method: string): string | null {
  if (method === "GET") return null;
  if (!body.trim()) return null; // empty body is legitimate
  try {
    JSON.parse(body);
    return null;
  } catch (error) {
    return error instanceof Error ? `Invalid JSON — ${error.message}` : "Invalid JSON";
  }
}

export function formatJson(body: string): string | null {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return null;
  }
}

export function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}
