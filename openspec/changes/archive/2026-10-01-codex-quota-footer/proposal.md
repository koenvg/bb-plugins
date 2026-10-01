# Proposal

## Why

Codex quota belongs beside Settings and Debug in the lower sidebar, rather than among the main navigation entries. The user should see the icon and remaining percentage there without opening the dashboard or reading a "Codex" label.

## What Changes

- Add a footer control showing a battery icon followed by the remaining percentage, for example an icon and `72%`. The battery fill follows fresh, idle remaining allowance; other states use an unfilled outline. Do not show a persistent "Codex" or "Codex Quota" text label. The user requested this icon follow-up after accepting the original footer placement.
- Open the existing quota dashboard on activation, preserving host selection, reset countdowns, and the official Codex Usage link.
- Hide the upper quota navigation entry only while the enhanced footer control is available. Leave normal navigation intact when footer attachment is unavailable or breaks.
- Keep the icon and percentage readable in the open compact sidebar as well as desktop layouts. Preserve truthful loading, stale, unavailable, and missing-selection feedback.
- Implement this entirely within the plugin, using public BB registration APIs and a narrowly scoped DOM adapter for the unsupported footer badge. Do not change BB core, the SDK, or persisted sidebar preferences.

## Capabilities

### New Capabilities

- `codex-quota-footer`: Footer placement, icon-and-percentage presentation, dashboard activation, compatibility fallback, and plugin lifecycle cleanup.

### Modified Capabilities

None in the current durable spec inventory. Existing quota behavior is described in the completed, unarchived `bb-codex-quota` and `quota-reset-countdown` changes. This new capability replaces their normal upper-navigation placement and compact badge omission when footer enhancement is active; their account scope, freshness rules, and dashboard behavior remain unchanged. Do not edit or archive those changes as part of this work.

## Impact

- `bb-plugin-codex-quota/app.tsx`, quota badge presentation, frontend integration tests, and a new bounded footer adapter with lifecycle tests.
- Plugin documentation and installed acceptance evidence for desktop and compact layouts.
- BB 0.44.0 and SDK 0.5.29 provide managed footer actions and app-wide React overlays, but the footer registration has no live badge field. The plugin must isolate and test its dependency on footer/navigation markup.
- Reuse the existing selection store, quota RPCs, cache, and freshness calculation. No backend contract changes, new quota polling, new dependencies, or credential access are intended.
