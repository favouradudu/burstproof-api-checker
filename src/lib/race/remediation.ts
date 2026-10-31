export type RemediationSnippet = {
  id: string;
  title: string;
  note: string;
  language: string;
  code: string;
};

export const REMEDIATIONS: RemediationSnippet[] = [
  {
    id: "row-lock",
    title: "Row locking — SELECT … FOR UPDATE",
    note: "Serialise concurrent writes on the same row. The first transaction to lock the row wins; the rest wait, then see the committed state and take the idempotent path.",
    language: "sql",
    code: `BEGIN;

-- Lock the existing row (or the gap it would occupy).
-- Concurrent duplicates block here until the winner commits.
SELECT * FROM orders WHERE cart_id = 'cart_8f3k2' FOR UPDATE;

-- Row absent -> this request is the creator:
INSERT INTO orders (id, cart_id, total_cents, status)
VALUES ('ord_01J...', 'cart_8f3k2', 2900, 'confirmed');

-- Row present -> return the existing order, change nothing.

COMMIT;`,
  },
  {
    id: "idempotency-key",
    title: "Idempotency key middleware",
    note: "Clients send a unique key per logical operation (UUID per checkout attempt). Duplicates replay the stored first response instead of executing the handler again.",
    language: "typescript",
    code: `import { randomUUID } from "node:crypto";

// Client: send Idempotency-Key: <uuid> with every state-changing request.
export async function idempotencyMiddleware(req, res, next) {
  const key = req.header("Idempotency-Key");
  if (!key) return res.status(400).json({ error: "missing_idempotency_key" });

  const cached = await redis.get(\`idem:\${key}\`);
  if (cached) {
    // Duplicate in flight or already completed: replay, don't re-execute.
    return res.status(200).json(JSON.parse(cached));
  }

  // Single-flight lock: only one worker executes the handler.
  const acquired = await redis.set(\`idem-lock:\${key}\`, "1", { nx: true, ex: 30 });
  if (!acquired) return res.status(409).json({ error: "duplicate_in_flight" });

  res.on("finish", () => {
    if (res.statusCode < 400) {
      redis.set(\`idem:\${key}\`, JSON.stringify(res.locals.response), { ex: 86_400 });
    }
    redis.del(\`idem-lock:\${key}\`);
  });

  next();
}`,
  },
  {
    id: "unique-constraint",
    title: "Database unique constraint (last line of defence)",
    note: "Even without locks, a DB constraint makes duplicates physically impossible. Map the constraint violation to a 409 Conflict in your API layer.",
    language: "sql",
    code: `ALTER TABLE orders
  ADD CONSTRAINT orders_cart_id_unique UNIQUE (cart_id);

-- Or claim one-per-user coupons:
ALTER TABLE coupon_claims
  ADD CONSTRAINT coupon_claims_user_code_unique UNIQUE (user_id, coupon_code);

-- Insert race safely: the loser gets a constraint violation, not a duplicate.
INSERT INTO coupon_claims (user_id, coupon_code, claimed_at)
VALUES ($1, $2, now())
ON CONFLICT (user_id, coupon_code) DO NOTHING
RETURNING id;

-- No returning row -> someone else claimed it first -> respond 409 Conflict.`,
  },
];
