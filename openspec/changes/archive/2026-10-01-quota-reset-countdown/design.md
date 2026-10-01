# Design

## Context

See proposal.md for motivation. `QuotaDashboard` already receives a `now` value and normalized windows with nullable `resetAt`. `WindowRow` currently renders only an absolute reset date. The dashboard status combines freshness, loading, and observation time; the badge has separate observation metadata.

`useQuota` already calls the shared store's `tick` every second. However, `tick` publishes `now` only when `visibleView` changes identity, usually at freshness transitions. Reading that clock without changing publication would leave countdowns frozen. This clock behavior and the distinction between fresh timestamp removal and stale warnings warrant a short design.

## Goals / Non-Goals

Goals:
- Keep duration formatting deterministic and shared between the summary and rows.
- Advance countdowns without extra requests or per-row timers.
- Preserve freshness and selection safeguards.

Non-goals:
- No new quota API, automatic reset redemption, inferred quota renewal, or sidebar countdown.
- No rewrite of observation caching or host/account selection.

## Decisions

### Reuse the shared clock with bounded publication

Keep the existing interval in `app.tsx`. Update `QuotaSelectionStore.tick` to publish a new `now` for visible snapshots when the wall-clock minute changes, as well as immediately on existing freshness transitions. Duplicate ticks within the same minute need not publish. Continue evaluating freshness on every tick. This gives at most minute-scale countdown lag without per-second rerenders or extra network traffic.

An alternative is a dashboard-local timer, but that duplicates existing time ownership and complicates tests and cleanup. Do not modify `observedAt` when advancing the clock.

### Use one pure reset-duration formatter

Accept the nullable reset timestamp and explicit `now`. Reject invalid dates before either relative or absolute formatting. Use millisecond subtraction, 24-hour days, and whole lower units as specified. Return unknown for missing/invalid timestamps, a duration for future timestamps, and "Reset due" at or after the reset instant.

Use the same formatter for the summary and `WindowRow`, passing the dashboard clock to general and additional rows. Keep exact dates beneath row countdowns. Avoid calendar-day arithmetic because timezone changes and midnight do not represent a full day remaining.

### Remove only the routine fresh status

Keep the current summary window name and append or prepend the reset label on its secondary line. For a healthy fresh, idle allowance, render no "Updated…" text. Preserve the status region's reserved space if needed to avoid layout shifts. Do not replace warning text with countdown text. Preserve current updating and stale timestamp feedback, missing-general-allowance feedback, and badge metadata.

The user's request names the normal "Updated…" line. Removing all observation timestamps would also remove useful stale-age context and conflict with existing failure behavior, so that broader change is excluded.

### Keep planning scoped to this extension

The durable inventory currently contains no Codex capability. The completed, unarchived `bb-codex-quota` change requires observation-time visibility. This proposal introduces a focused `codex-quota-countdown` capability and explicitly narrows that old wording only for a fresh dashboard. At archive time, reconcile the broader capability to retain stale timestamps and sidebar metadata without reintroducing the routine fresh line. Do not edit the earlier change as part of implementation.

## Risks / Trade-offs

- Clock skew can affect the countdown. Use the same browser clock already used for freshness; do not claim a reset actually occurred based on time alone.
- Minute-bounded publication can lag a formatting boundary by up to one minute. This is acceptable for a days/hours display and avoids unnecessary rerenders.
- A stale snapshot can still contain a useful scheduled reset. Keep the stale warning visible and show "Reset due" rather than fabricating renewed allowance.
- Added row text can wrap on mobile. Keep existing flexible layout and verify a narrow viewport, including long timezone labels.

## Migration Plan

No data migration or new dependencies. Ship the presentation, shared-clock publication, tests, and documentation together. Run the plugin test suite, typecheck, and build; inspect the mobile layout. Roll back those changes together if needed. No credential, cache, or host-state cleanup is required.
