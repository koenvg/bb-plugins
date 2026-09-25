# Codex Quota

This standalone BB plugin shows quota windows for the Pi `openai-codex` account on an explicitly selected enrolled host. Its sidebar and dashboard passed installed acceptance on BB 0.43.4 with BB's Provider usage plugin disabled; see [ACCEPTANCE.md](ACCEPTANCE.md). It never calls `system.usageLimits`.

## Sign-in and account scope

Sign in to OpenAI Codex through Pi **on the selected host** before checking quota. The host worker uses Pi's existing OAuth credentials; it does not initiate a model turn or copy tokens to BB's server or browser. The selected Pi account can differ from the account signed in to your browser. Open [Codex Usage](https://chatgpt.com/codex/settings/usage) to check details, expiry, and redeem resets yourself; this plugin does not redeem them.

The browser gets bounded normalized percentages and reset times, an optional known plan, and a banked-reset count only when the upstream explicitly reports a nonnegative integer. **Unknown** is not zero. The limiting general window is the lowest remaining percentage; additional/model-specific limits stay separate. These percentages are not exact token balances or costs.

## Freshness and limitations

A successful snapshot is fresh for less than five minutes. Older values are labeled stale with their original observation time, even without a refresh failure, and are unavailable at 24 hours. A failed quota GET can retain an explicitly stale observation. On return or focus, the browser marks its observation non-current until the selected host checks Pi's active account; the host cache can answer that check without another quota GET. Offline hosts and changed or uncheckable identities cannot return another account's snapshot as fresh. Host worker memory is the only authoritative quota cache; reload discards it. The private Codex quota endpoint and its response fields can change without notice.

No Pi or BB transcript/session history is read. There is no collector, thread cost/token attribution, historical import, or background reset redemption. BBP-1 tracks the separate history investigation.

## Development checks

From this directory run `npm test`, `npm run typecheck`, `bb plugin types --check`, and `npm run test:bundle`. Bundle tests use temporary synthetic credentials and stubbed responses for both fresh and expiring OAuth tokens, without live network. The historical host OAuth/quota probe is recorded in [FEASIBILITY.md](FEASIBILITY.md); the production probe RPC has since been removed.
