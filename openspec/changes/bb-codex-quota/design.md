# Design

## Context

See [proposal.md](proposal.md) for scope and [the quota spec](specs/codex-quota/spec.md) for behavior. Installed BB 0.43.4 and Plugin SDK 0.5.9 support separate `bb.server`, `bb.host`, and `bb.app` entries, host RPC, navigation panels, and a compact sidebar accessory. BB's Provider usage plugin is disabled; its `system.usageLimits` result did not cover the inspected Pi-only Codex account. There is no supported BB API for per-message Pi usage, but this plugin does not need one.

OpenForge's existing Pi-based Codex adapter is evidence of a possible account path, not an installed-BB acceptance pass. It obtains `openai-codex` OAuth through Pi's public `ModelRuntime` and reads `https://chatgpt.com/backend-api/wham/usage`. The response has contained `rate_limit` windows with `used_percent`, `reset_at` or `reset_after_seconds`, and optional `rate_limit_reset_credits.available_count`. That endpoint and response format are private. The official Codex pricing page links to `https://chatgpt.com/codex/settings/usage`; the signed-in browser account might differ from Pi's account on the selected host.

## Goals / Non-Goals

**Goals:** Show the limiting general-window percentage remaining, each reported allowance's reset time when known, optional banked-reset availability, and an official link. Make missing values and old snapshots obvious without exposing credentials.

**Non-Goals:** BB-thread identity, transcript collection, token/cost accounting, historical import, automatic redemption, Pi extensions, cross-account aggregation, or dependence on BB's built-in Provider usage plugin. [BBP-1] is the separate later investigation of BB-scoped history.

## Decisions

### Host owns authentication and quota parsing

Build `bb-plugin-codex-quota` as a standalone host/server/app plugin. A BB-selected enrolled host is the only source for its current Pi account; the server validates that host before routing requests through typed plugin host RPC. On that host, use Pi's public `ModelRuntime` to check and refresh `openai-codex` OAuth and fetch only the quota endpoint. Decode the account claim only in host memory when upstream requires its account header. Bind each request to a selection generation and an in-memory account/credential fingerprint. Immediately before caching or returning the result, recheck the server selection and the host's active Pi identity; discard any response whose binding changed or cannot be rechecked. The fingerprint never enters RPC or logs. Bound network time, response bytes, and RPC result size. Never log tokens, headers, account claim IDs, or raw response bodies. Return fixed status codes and normalized window/reset fields. No SQLite, bridge-file reader, transcript access, or collection worker lease is required.

Alternative rejected: `bb.sdk.system.usageLimits` or a Provider usage RPC. Those depend on the disabled built-in feature and did not cover the inspected account. A copied OAuth token or frontend fetch would expose credentials outside the owning host.

### Quota math follows the reported windows

Accept finite percentages in [0, 100] from recognized general `rate_limit` windows; calculate `100 - used_percent` for each. The summary chooses the minimum remaining percentage among valid general windows, resolving a tie by upstream window order. Additional/model-specific limits appear in separate rows and do not silently change the general summary. Use a valid absolute reset timestamp when present, otherwise a valid relative reset from the observation time; absent or invalid times stay unknown. `available_count` must be a finite nonnegative integer; missing or malformed count is unknown, not zero. Keep the banked-reset indicator separate from the recurring window reset times. Do not guess reset eligibility or expiry from the count.

Alternative rejected: one combined percentage or an estimated absolute token balance. Codex reports quota windows, not a fixed token budget for a model mix.

### One scoped snapshot shared by the sidebar and dashboard

Cache normalized success results only in host-worker memory, scoped to the selected host and the active Pi account identity. Check identity both before a request and again before publishing its response; discard a delayed response after a selection/account change. If the identity cannot be rechecked, do not cache or show that response. Worker restart simply loses the cache. Coalesce simultaneous requests from badge and dashboard and refresh on demand with a bounded minimum interval to avoid polling loops. A successful observation is fresh for at most five minutes, even if no refresh has failed. The mounted UI changes its freshness label when that deadline passes and requests a bounded refresh on the next view, focus, or explicit refresh. Show older values only as stale with their original observation time; after 24 hours, drop them as unavailable. On clock uncertainty, prefer stale or unavailable. An offline host cannot serve its memory cache, so the server returns unavailable rather than keeping a second, possibly misattributed copy. Do not persist raw upstream data or account identity on the BB server or in the browser.

Use `app.slots.navPanel` for the dashboard and the supported sidebar accessory for the short remaining-percentage label. The badge is presentational; the host-owned navigation row handles mouse and keyboard activation. The installed SDK hides the accessory on compact viewports, so the dashboard itself begins with the same quota summary and official link. Show scope and observation time in accessible text. Link to the official Codex page, but do not assert that the browser's signed-in account matches the selected Pi account or add a redeem button.

Alternative rejected: separate sidebar and dashboard pollers. They can disagree and generate unnecessary OAuth refreshes.

## Risks / Trade-offs

- [Pi OAuth or private Codex endpoint changes] -> A real installed-host observation gates acceptance. A failed auth or changed response stays unavailable; synthetic tests cannot replace the gate.
- [Worker restarts or disconnected hosts] -> The in-memory cache disappears. This is preferable to a server-owned snapshot that could outlive account selection or hide a stale value.
- [Missing or newly named banked-reset field] -> Show unknown and direct the user to Codex Usage. An explicit reported zero remains zero.
- [Browser account differs from the selected host's Pi account] -> Identify the host scope next to the quota, keep the link generic, and let Codex show its own signed-in account before redemption.

## Migration plan

1. Scaffold the new package and verify BB 0.43.4/SDK 0.5.9 build and typed host RPC. The removed `bb-codex-usage` plugin and incomplete bridge verification are not prerequisites or evidence for this change.
2. First prove host-local Pi OAuth and one real quota response without returning or logging credentials. If this fails, record the blocker and leave dependent implementation and installed acceptance unchecked. A quota GET does not send a Pi model turn.
3. Add bounded parsing, host cache, shared sidebar/dashboard UI, and failure-state tests. Verify the official link, compact navigation, absent count, and strict privacy boundary with Provider usage disabled.
4. Install and inspect the account view on a selected enrolled host. Disable or uninstall the plugin to roll back; it has no transcript reader, background collection, or historical database to migrate.
