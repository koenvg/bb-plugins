# Proposal

## Why

Codex Quota currently reads on mount, focus, host selection, or manual refresh, but its timer only ages the displayed snapshot. The sidebar also replaces a still-fresh percentage with a dash during any read, making normal updates look like missing data.

## What Changes

- Refresh the explicitly selected host's Codex quota automatically while a BB app window is open, including when the quota dashboard is closed or the sidebar accessory is not mounted.
- Use one app-window refresh owner shared by the dashboard and badge. Proposed defaults are a one-minute cadence and bounded failure backoff, with no new user settings.
- Keep the last same-selection, still-fresh percentage visible during an update. Continue to show an accessible updating status and hide a bare percentage once data is stale, unavailable, or outside the selected scope.
- Dispose timers and listeners on plugin deactivation, reload, or window teardown, and ignore late results from a disposed owner. No server or host background polling will remain after all windows close.
- Preserve explicit host selection, host-local OAuth, identity rechecks, request coalescing, retry limits, five-minute freshness, and 24-hour expiry.

## Capabilities

### New Capabilities

- `codex-quota-background-refresh`: App-window-owned quota refresh, failure recovery, lifecycle cleanup, and stable presentation of fresh data during updates.

### Modified Capabilities

None in the current main-spec inventory. The base quota capability exists only in the completed, unarchived `bb-codex-quota` change. This follow-up explicitly revises that change's rule that all loading states must hide a fresh percentage: loading alone will no longer hide an otherwise fresh, same-selection observation. The original change is not edited by this proposal.

## Impact

- `bb-plugin-codex-quota/app.tsx`, its shared selection store, quota view, and their lifecycle, fake-timer, race, and rendering tests.
- The installed SDK 0.5.9 already declares `app.slots.experimental_appOverlay`, an app-window React owner with SDK hook context. No SDK upgrade, new dependency, or RPC payload change is planned.
- Existing host/server quota handlers remain request-driven. The private Codex endpoint will receive periodic reads from open clients, bounded by the host cache's existing 30-second minimum interval.
- Plugin documentation and installed acceptance evidence must describe the open-window lifetime, browser timer throttling, retry behavior, and unchanged authentication/privacy boundary.
