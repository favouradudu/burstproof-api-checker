# Burstproof Api Checker

Build a web app called "Idempotent" – an API race condition and concurrency stress-tester for developers.

Features and architecture:
1. Header & Hero: Clean dark developer aesthetic (terminal / modern developer tool style). Title: "Idempotent", subtitle: "Test if your endpoints survive concurrent double-submits and race conditions". Include a GitHub link button and documentation/help tips.
2. Configuration Panel:
   - Target URL input with HTTP method selector (POST, PUT, PATCH, GET).
   - Headers editor (key-value or JSON, with easy preset for Authorization Bearer / Content-Type).
   - JSON Request Body editor with syntax formatting and validation.
   - Concurrency slider (burst size: 5 to 25 simultaneous requests, default 10).
   - Quick presets: "E-commerce Checkout", "Coupon Claim", "Wallet Transfer", "Counter Increment" with pre-filled mock endpoints or example payloads.
   - Built-in Mock / Demo Mode: Allow testing even without a real endpoint by providing a built-in mock endpoint (e.g. simulate vulnerable vs. protected endpoint behavior) so first-time visitors can see the tool in action immediately.
3. Execution / Proxy Engine:
   - Handle requests either through a serverless backend / edge function proxy to avoid browser CORS issues on third-party APIs, or client-side with clear fallback/explanation if CORS blocks.
   - Dispatches the exact burst of requests simultaneously using Promise.all(), timestamping the dispatch and receipt to the millisecond.
4. Results & Verdict View:
   - Prominent Verdict Card:
     - 🟢 "Idempotent / Protected": Only 1 state change or conflict detected; other requests handled with 409 Conflict, 429, or identical deduplicated response.
     - 🔴 "Vulnerable to Race Condition": Multiple 200/201 responses with differing IDs or state changes detected in the same millisecond window.
   - Visual Waterfall / Timeline: Request list (#1 to #10) showing millisecond latency, HTTP status code badges (200, 201, 409, 429, 500), and response payloads.
   - Plain-English Analysis & Remediation: Explanation of why the race condition happened, and copyable code snippets/solutions (e.g. database row locking with SELECT ... FOR UPDATE, idempotency key middleware, unique constraints).
   - Export / Copy test report as Markdown or JSON to share in GitHub issues or pull requests.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://burstproof-api-checker.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7d9a80ae-d8fa-419c-81e8-9a39db0184d3).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
