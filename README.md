<div align="center">

# Burstproof

**API race condition & concurrency stress-tester**

[![Live Demo](https://img.shields.io/badge/Live_Demo-burstproof--api--checker.lovable.app-0ea5e9?style=for-the-badge&logo=googlechrome&logoColor=white)](https://burstproof-api-checker.lovable.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-Vitest-passing-7c3aed?style=for-the-badge)](#development)

</div>

Test whether state-changing endpoints survive concurrent duplicate submissions —
double-clicked "Pay" buttons, retried transfers, duplicated webhooks — before you deploy.

---

> **Zero setup demo:** open the [live app](https://burstproof-api-checker.lovable.app), pick the
> **E-commerce Checkout** preset, keep the demo toggle on *Vulnerable*, and run the burst. Ten
> simultaneous requests all return `201 Created` with different order IDs — a double charge in the
> making. Switch to *Protected* and run again: one `201`, the rest `409 Conflict`.

## The problem: the double-click nightmare

Every state-changing endpoint that follows the *read → check → write* pattern is vulnerable to a
**TOCTOU (time-of-check to time-of-use)** race:

```text
Request A: SELECT balance → checks $50 → charges $50 ✓
Request B: SELECT balance → checks $50 → charges $50 ✓   ← both passed the check
Result:    $100 debited, order duplicated, refund support ticket opened
```

Conventional test suites don't catch this. Unit tests call the handler one request at a time, and
integration tests hit the endpoint sequentially, so the check and the write are never interleaved.
The bug exists only when two requests arrive in the same millisecond — which is exactly what happens
when a user double-clicks "Pay", a payment webhook retries, or a flaky mobile client resubmits.

Burstproof fires a real, simultaneous burst at the endpoint and inspects the responses. If multiple
requests succeeded and changed state independently, the endpoint has a race condition — and the
report contains the evidence.

## Features

- **Simultaneous burst dispatch** — 5–25 requests fired in a single `Promise.all()` tick, each
  timestamped at dispatch and receipt.
- **CORS-safe server proxy** — audit any public staging or production API without browser CORS
  restrictions; optional direct-browser dispatch when you want to test the client path.
- **Request waterfall** — per-request latency, HTTP status badges (`200`, `201`, `409`, `429`,
  `500`), and expandable response payloads.
- **Verdict** — one-glance classification: protected (one state change, or duplicates rejected with
  `409`/`429` or deduplicated) vs. vulnerable (multiple `2xx` responses with distinct resource IDs
  in the same burst window).
- **Remediation patterns** — copyable snippets for Postgres `SELECT … FOR UPDATE` row locks,
  Redis-backed `Idempotency-Key` middleware, and database unique constraints with `ON CONFLICT`
  handling.
- **Zero-config presets** — E-commerce Checkout, Coupon Claim, Wallet Transfer, Counter Increment;
  each ships with a vulnerable and a protected mock endpoint.
- **Live playground targets** — JSONPlaceholder's duplicate-creating `POST /posts` and httpbin's
  echo / uuid endpoints, autofilled with one click.
- **Idempotency-Key mode** — send one shared UUID on every request in the burst, or send raw
  requests with no key, to verify whether the endpoint honours idempotency tokens.
- **Exports** — Markdown or JSON reports for GitHub issues and pull requests, plus a parallel bash
  cURL burst and a GitHub Actions workflow reproducing the configured burst. Secret header values
  are redacted into an env var / CI secret automatically.

## Quickstart

### Live (no install)

1. Open [burstproof-api-checker.lovable.app](https://burstproof-api-checker.lovable.app).
2. Pick a preset, click a live playground target (JSONPlaceholder or httpbin), or paste your own
   URL, method, headers, and JSON body.
3. Set the burst size (5–25) and hit **Run burst**.
4. Read the verdict and the waterfall, then export the Markdown report into your bug tracker — or
   the cURL burst / GitHub Actions workflow into your repo.

> The bundled mock endpoints live under `/api/public/mock/*` and simulate vulnerable vs. protected
> behaviour in-memory. Point the URL at `https://staging.yourcompany.com/api/checkout` and the same
> burst runs through the proxy against your real API.

### Local development

```sh
git clone https://github.com/favouradudu/burstproof-api-checker
cd burstproof-api-checker
npm install
npm run dev
```

Open [http://localhost:8080](http://localhost:8080) — the mock endpoints and proxy both work
locally out of the box, no database or external services required.

### Auditing your own API

```text
Target URL:  https://staging.acme.com/api/orders
Method:      POST
Headers:     Content-Type: application/json
             Authorization: Bearer <staging-only-token>
Body:        { "cart_id": "cart_test_1", "total_cents": 100 }
Burst size:  10
```

Read the verdict before you interpret results:

- **Protected** — one state change, or every duplicate rejected with `409`/`429` or deduplicated
  onto identical responses. The endpoint survives double-submits.
- **Vulnerable** — multiple `200`/`201` responses with distinct IDs or independent state changes
  inside the same burst window. Fix it before users find it.

> Only test endpoints you own or are authorized to audit. Bursts are real HTTP traffic — a
> protected wallet endpoint will still create one order per run.

## Architecture

- **Verdict engine** — `src/lib/race/`: pure, dependency-free burst dispatcher, verdict classifier,
  preset definitions, and report exporters. Unit-tested with Vitest, no DOM required.
- **Server proxy** — `src/routes/api/public/proxy.ts`: relays bursts server-side so third-party and
  cross-origin targets work from the browser. Same-origin targets are allowed; private hosts are
  blocked.
- **Built-in mocks** — `src/routes/api/public/mock/$.ts` + `src/lib/mock-state.server.ts`: serve
  the vulnerable/protected demo endpoints from in-memory state. Demo-only, never durable storage.
- **UI** — `src/components/burstproof/`: config panel, waterfall, verdict card, and remediation
  snippets, consuming the engine modules directly.

## Tech stack

- [React 19](https://react.dev) + [TanStack Start](https://tanstack.com/start) (SSR, server routes)
- [TypeScript](https://www.typescriptlang.org) (strict mode)
- [Tailwind CSS v4](https://tailwindcss.com), [shadcn/ui](https://ui.shadcn.com) +
  [Radix UI](https://www.radix-ui.com), [TanStack Query](https://tanstack.com/query)
- [Vitest](https://vitest.dev) + [Testing Library](https://testing-library.com)

## Development

```sh
npm install
npm run test:watch   # Vitest watch mode
npm run lint         # eslint + prettier
npm run build        # verify a clean production build
```

Contributions are welcome — especially new presets, verdict heuristics, and remediation snippets.
Guidelines:

- Engine logic goes in `src/lib/race/` as pure, testable modules with matching tests in
  `src/test/`. Keep verdict heuristics out of the UI.
- Add a test for behaviour changes: one test per rule, asserting concrete values.
- Keep the prose plain and technical.

## License

Released under the [MIT License](LICENSE) — free for personal and commercial use.
