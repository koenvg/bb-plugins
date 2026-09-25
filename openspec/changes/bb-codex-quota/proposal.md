# Proposal

## Why

I want to see how much of my Codex allowance remains and whether a banked reset is available without opening a separate page just to check. Thread-level token and cost history needs a separate investigation and should not hold up a small quota view.

## What Changes

- Add a standalone BB Codex Quota plugin. On the selected enrolled host, read the Pi `openai-codex` account's reported allowance windows, remaining percentages, and reset times. Show the most restrictive valid general window in the sidebar and every reported window in a dashboard.
- Show a banked reset count only when Codex reports one. A missing count means unknown, not zero. Link to [Codex Usage](https://chatgpt.com/codex/settings/usage) for reset details and redemption; the plugin never applies a reset.
- Make freshness, unavailable authentication, and upstream failures explicit. Keep credentials and raw responses on the host. Do not use BB's built-in Provider usage plugin or `system.usageLimits`.
- Leave transcript reading, per-thread token/cost history, historical import, and a Pi collector out of this release. Track investigation separately in BB task BBP-1.

## Capabilities

### New Capabilities

- `codex-quota`: Host-owned Codex allowance snapshots, a BB sidebar/dashboard view, banked-reset availability, and a link to the official usage page.

### Modified Capabilities

None.

## Impact

A new `bb-plugin-codex-quota` package with a BB host entry, server RPC, and sidebar/dashboard UI. It uses Pi's host-local Codex OAuth through its public authentication runtime and an upstream Codex usage endpoint whose shape is private and must pass an installed-BB check before the account view is accepted. It does not inspect BB Pi bridge files, install a collector, read sessions, or calculate billable cost. The old, unverified `bb-codex-usage` prototype and proposal have been removed rather than marked complete.
