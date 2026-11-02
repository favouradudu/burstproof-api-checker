<div align="center">

# ⚡ Idempotent

**API Race Condition & Concurrency Stress-Tester**

[![Live Demo](https://img.shields.io/badge/Live_Demo-burstproof--api--checker.lovable.app-0ea5e9?style=for-the-badge&logo=googlechrome&logoColor=white)](https://burstproof-api-checker.lovable.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](LICENSE)
[![Built with React 19 + TanStack Start](https://img.shields.io/badge/React_19_+TanStack_Start-TypeScript-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](#tech-stack)
[![Tests](https://img.shields.io/badge/Tests-Vitest-passing-7c3aed?style=for-the-badge&logo=vitest&logoColor=white)](#development)

Test if your checkout, claim, or transfer endpoints survive concurrent
double-submits and race conditions — **before you deploy**.

</div>

---

> 💡 **Zero setup demo:** Open the [live app](https://burstproof-api-checker.lovable.app), pick the
> **E-commerce Checkout** preset, set the toggle to *Vulnerable*, and hit **Run burst**. You'll watch
> 10 simultaneous requests all return `201 Created` with different order IDs — a double charge in the
> making. Flip to *Protected* and run again to see the `409 Conflict` shield in action.

## 📖 The Problem: The Double-Click Nightmare

Every state-changing endpoint that follows the pattern *read → check → write* is vulnerable to a
**TOCTOU (Time-of-Check to Time-of-Use)** race:

```text
Request A: SELECT balance → checks $50 → charges $50 ✓
Request B: SELECT balance → checks $50 → charges $50 ✓   ← both passed the check
Result:    $100 debited, order duplicated, refund support ticket opened
```

Traditional test suites can't catch this. Unit tests call your handler one request at a time, so the
check and the write are never interleaved. Integration tests hit the endpoint sequentially. The bug
only exists **when two requests arrive in the same millisecond** — exactly what happens when a user
double-clicks "Pay", a payment webhook retries, or a flaky mobile client resubmits.

Idempotent fires a real, simultaneous burst at your endpoint and reads the aftermath: if multiple
requests all succeeded and changed state independently, you have a race condition — with the
evidence to prove it.

## ✨ Features

| | |
|---|---|
| **⏱️ Millisecond burst dispatch** | Fires 5–25 requests truly simultaneously via `Promise.all()`, timestamping each dispatch and receipt to the millisecond. |
| **🛡️ CORS-safe server proxy** | Audits any public staging or production API through a server-side proxy — no browser CORS headaches, and optional direct-browser dispatch when you want to test the client path. |
| **🌊 Interactive request waterfall** | Timeline of every request in the burst: per-request latency, HTTP status badges (`200`, `201`, `409`, `429`, `500`), and expandable response payloads. |
| **🧠 Plain-English analysis** | A one-glance verdict card — 🟢 *Idempotent / Protected* vs 🔴 *Vulnerable to Race Condition* — plus a step-by-step explanation of exactly why the race happened. |
| **🔧 Copyable remediation patterns** | Working code snippets for the three industry-standard fixes: Postgres `SELECT … FOR UPDATE` row locks, Redis-backed `Idempotency-Key` middleware, and database unique constraints with `ON CONFLICT` handling. |
| **📦 Zero-config presets** | Built-in demo mode with four realistic scenarios — E-commerce Checkout, Coupon Claim, Wallet Transfer, Counter Increment — each with a vulnerable and a protected mock endpoint, so you can see the tool work before wiring up your own API. |
| **📤 Exportable audit reports** | Copy or download the full run as Markdown (paste straight into a GitHub issue or PR) or JSON (pipe into CI). Header values are redacted automatically so credentials never leak into exports. |

## 🚀 Quickstart

### Live (no install)

1. Open [burstproof-api-checker.lovable.app](https://burstproof-api-checker.lovable.app).
2. Pick a preset — or paste your own target URL, method, headers, and JSON body.
3. Set the burst size (5–25) and hit **Run burst**.
4. Read the verdict card and the waterfall, then export the Markdown report into your bug tracker.

> The bundled mock endpoints live under `/api/public/mock/*` and simulate vulnerable vs. protected
> behaviour in-memory. Point the URL at `https://staging.yourcompany.com/api/checkout` and the same
> burst runs through the proxy against your real API.

### Local development

```sh
git clone <this-repository-url>
cd <repository-name>
npm install
npm run dev
```

Open [http://localhost:8080](http://localhost:8080) — the mock endpoints and proxy both work locally
out of the box, no database or external services required.

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

- **🟢 Idempotent / Protected** — one state change (or one success plus `409`/`429`/identical
  deduplicated responses). Your endpoint survives double-submits.
- **🔴 Vulnerable** — multiple `200`/`201` responses with differing IDs or state changes inside the
  same burst window. Ship the fix before the users find it.

> ⚠️ Only test endpoints you own or are authorised to audit. The burst sends real requests —
> a protected wallet endpoint will really create one order per run.

## 🧱 Architecture

- **Verdict engine** — `src/lib/race/` holds the pure, dependency-free analysis modules: burst
  dispatcher, verdict classifier, preset definitions, and report exporters. Fully unit-tested with
  Vitest, no DOM required.
- **Server proxy** — `src/routes/api/public/proxy.ts` relays bursts server-side so third-party and
  cross-origin targets work from the browser. Same-origin targets are allowed; private hosts are
  blocked.
- **Built-in mocks** — `src/routes/api/public/mock/$.ts` + `src/lib/mock-state.server.ts` serve the
  vulnerable/protected demo endpoints from in-memory state. Demo-only, never durable storage.
- **UI** — `src/components/idempotent/` renders the config panel, waterfall, verdict card, and
  remediation snippets, consuming the engine modules directly.

## 🛠️ Tech Stack

- [React 19](https://react.dev) + [TanStack Start](https://tanstack.com/start) (SSR, server routes)
- [TypeScript](https://www.typescriptlang.org), strict mode
- [Tailwind CSS v4](https://tailwindcss.com)
- [TanStack Query](https://tanstack.com/query) + [Radix UI](https://www.radix-ui.com) +
  [shadcn/ui](https://ui.shadcn.com) components
- [Vitest](https://vitest.dev) + [Testing Library](https://testing-library.com)

## 🤝 Contributing

PRs and issues are welcome — especially new presets, verdict heuristics, and remediation snippets.

```sh
npm install
npm run test:watch   # TDD-friendly watch mode
npm run lint         # eslint + prettier
npm run build        # verify a clean production build
```

Guidelines:

- **Engine logic goes in `src/lib/race/`** as pure, testable modules with matching tests in
  `src/test/` — keep UI free of verdict heuristics.
- **Test first for behaviour changes**: one test per rule, asserting concrete values.
- Keep the prose plain-English. This tool's job is to make race conditions legible to everyone on
  the team.

## 📄 License

Released under the [MIT License](LICENSE) — free for personal and commercial use. Race-test your
hearts out.

<div align="center">

**Found a race condition with this tool?** [⭐ Star the repo](#) and share the report in your PR —
it makes for a very compelling code-review comment.

</div>
