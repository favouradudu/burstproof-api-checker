<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture

- Race-test engine lives in `src/lib/race/` as pure, testable modules (verdict analysis, burst dispatcher, report exporters, presets); UI consumes it from `src/components/idempotent/`.
- Outbound proxied requests go through the `/api/public/proxy` server route (same-origin targets allowed, other private hosts blocked); built-in demo targets at `/api/public/mock/*` use in-memory state in `src/lib/mock-state.server.ts` — demo-only, never durable storage.
