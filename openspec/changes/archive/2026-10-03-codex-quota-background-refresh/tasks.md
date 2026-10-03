# Tasks

## 1. Shared refresh scheduling and lifecycle

- [x] 1.1 Add a failing fake-timer regression to `selection-store.lifecycle.test.ts` for activation, a completion-based 60-second periodic read, `refresh: true` on scheduled reads, and no quota read without selection; implement the store's start/dispose scheduling boundary and verify the focused tests pass without overlapping requests.
- [x] 1.2 Add failure/recovery tests before implementing the 60/120/240/300-second backoff and unified outcome handling for automatic and manual reads; verify rejected requests and stale/unavailable responses back off, fresh responses reset cadence, manual requests coalesce, and retained observation timestamps do not change on failure.
- [x] 1.3 Add deferred-promise race tests before implementing owner-generation guards and retry reset on selection changes; verify disposed synchronization/read/manual-action completions neither publish nor re-arm, repeated start/dispose is safe, a new selection clears old data and backoff, and late old-host results cannot appear in the new view.
- [x] 1.4 Document the shared store's ownership, injected clock/timer boundary, and retry-outcome rules beside that boundary; verify the comments match the lifecycle and backoff tests and introduce no generic polling framework or RPC changes.

## 2. App-window ownership and resume behavior

- [x] 2.1 Add a failing SDK app test that mounts the app-wide owner without dashboard or badge, then register a null-rendering owner through `experimental_appOverlay` and remove automatic scheduling from view hooks; verify periodic reads continue with no quota views mounted and mounting page/badge/split consumers adds no refresh owner or read loop.
- [x] 2.2 Add focus/visibility, selection-sync failure, and clock-jump regressions before implementing deadline-aware resume listeners; verify repeated focus cannot bypass backoff, failed selection synchronization prevents an unconfirmed quota read, a resumed window performs at most one overdue read, and a new server selection is discovered without carrying the old backoff.
- [x] 2.3 Update app lifecycle coverage for owner unmount, effect replay, reload, and independent windows, and verify all owned timers/listeners are released and one window's teardown cannot stop another. Retain host-cache tests proving multi-client request coalescing and the 30-second upstream gate remain effective for forced reads.
- [x] 2.4 Update `README.md` to describe open-window-only background reads, the one-minute default, failure backoff, explicit host selection, browser suspension limits, and the absence of server/host polling jobs; verify the text agrees with the implemented lifecycle and current SDK contract.

## 3. Stable and honest refresh presentation

- [x] 3.1 Replace the old loading-dash expectation in `quota-view.test.tsx` with a failing fresh-while-updating regression, then adjust badge eligibility and accessible text; verify fresh 0%, 42%, and 100% remain visible during an update with the original observation time, while initial loading and missing general percentages show no percentage.
- [x] 3.2 Add pending-read freshness-boundary and failure tests before adjusting status presentation; verify the badge becomes `Stale` at five minutes, unavailable at 24 hours, and the dashboard's single no-spinner status line explicitly identifies a stale observation even while updating. Verify host changes still clear the old percentage immediately.
- [x] 3.3 Document fresh-while-updating versus stale/unavailable behavior in the README freshness section, and verify its examples match rendering tests and do not claim an observed percentage is real-time or extend its validity during updates.

## 4. Integrated verification and installed acceptance

- [x] 4.1 From `bb-plugin-codex-quota`, run `npm test`, `npm run typecheck`, `bb plugin types --check`, and `npm run test:bundle`; verify existing OAuth, privacy, identity/selection-race, cache, and SDK-surface checks still pass alongside the new scheduling and rendering tests.
- [x] 4.2 Install or reload the implementation in the implementation phase and record new evidence in `ACCEPTANCE.md`: verify real selected-host Pi Codex quota with Provider usage disabled, observation updates while the dashboard is closed and the accessory is unmounted in compact layout, a retained fresh percentage during refresh, one bounded catch-up after resume, and cleanup on reload/window teardown. Keep live acceptance unchecked and record a blocker if a real authenticated observation or a required lifecycle check cannot be obtained; synthetic tests and prior acceptance alone do not complete this task.
