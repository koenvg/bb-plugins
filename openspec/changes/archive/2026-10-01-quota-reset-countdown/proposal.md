# Proposal

## Why

The Codex Quota dashboard shows when a window resets but makes the user calculate how much time is left. A reset countdown is more useful in the summary than the routine "Updated…" timestamp.

## What Changes

- Show time left until the binding window resets beneath the remaining percentage, alongside its existing window label.
- Show a countdown for each general and additional limit window while retaining its exact reset date.
- Display days and hours for longer durations, hours and minutes below one day, and minutes below one hour.
- Remove the routine fresh-state "Updated…" line. Preserve stale, updating, and unavailable feedback and stale observation timestamps.
- Derive countdowns from the existing reset timestamp and browser clock without changing quota fetching or inferring renewed allowance.

## Capabilities

### New Capabilities

- `codex-quota-countdown`: Relative reset timing and a quieter fresh dashboard summary.

### Modified Capabilities

None in the current durable spec inventory. The completed but unarchived `bb-codex-quota` change contains the broader `codex-quota` capability. This change narrows its observation-time display expectation for the fresh dashboard only; stale timestamps and sidebar observation metadata remain intact. Reconcile that wording when archiving the two changes.

## Impact

- Presentation and tests in `bb-plugin-codex-quota/quota-view.tsx` and `quota-view.test.tsx`, with a small pure duration formatter if useful.
- Reuse the existing shared `now` clock; no new API fields, dependencies, host requests, or cache behavior.
- Adjust `selection-store.ts` clock publication and its tests so countdowns advance even when freshness does not change. The existing timer already ticks every second, but the store currently publishes only on freshness transitions.
- Keep sidebar badge behavior, host selection, freshness expiry, and exact reset dates unchanged.
- Update plugin documentation to describe the countdown and fresh-state timestamp removal.
