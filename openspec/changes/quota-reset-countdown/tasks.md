# Tasks

## 1. Deterministic countdown and live clock

- [x] 1.1 Add a pure reset-duration formatter with tests for days/hours, hours/minutes, minutes, singular units, omitted zero units, sub-minute values, due/past resets, and unknown/invalid timestamps; verify the formatter tests pass with fixed clocks and timezone-independent durations.
- [x] 1.2 Update `selection-store.ts` to publish the clock at minute boundaries for visible snapshots while retaining immediate freshness transitions; extend `selection-store.test.ts` to verify fresh and stale clock advancement, duplicate-tick suppression, unchanged observation time, expiry, and no quota calls from ticks.

## 2. Dashboard presentation

- [x] 2.1 Render the binding countdown beside the summary window label and each general/additional row's countdown above its exact reset date; extend `quota-view.test.tsx` to verify correct window selection, preserved dates, unknown resets, clock-driven changes, and hidden countdowns for pending/unavailable/expired snapshots.
- [x] 2.2 Remove only the healthy fresh-state "Updated…" text; update UI tests to verify its absence while retaining updating, stale timestamp, unavailable-general-allowance, offline, authentication, and missing-selection feedback and unchanged badge metadata.
- [x] 2.3 Update `bb-plugin-codex-quota/README.md` with countdown precision, "Reset due" semantics, and fresh timestamp removal; verify the documentation agrees with the spec and still explains stale observation timestamps.

## 3. Integration verification

- [x] 3.1 Run `npm test`, `npm run typecheck`, and `npm run build` from `bb-plugin-codex-quota`; record results and resolve regressions before marking complete.
- [x] 3.2 Verify the dashboard at a narrow mobile viewport and desktop width: countdowns and exact dates wrap without horizontal overflow, the routine timestamp is absent, stale warnings remain visible, and the countdown advances without manual refresh; record evidence or an explicit environment blocker.

## Verification evidence

- Formatter and shared-clock tests failed before implementation, then passed: 24 tests.
- Dashboard tests failed before implementation, then passed: 11 tests.
- Full suite: 61 tests across 9 files passed. TypeScript and plugin build passed.
- Bundled OAuth fresh-token and refresh-token synthetic checks passed.
- Arc preview used the actual dashboard and shared store with synthetic data and installed BB stylesheet. At 320, 375, and 1280 CSS pixels, no horizontal overflow; reset dates and countdowns remained visible. Advancing the store clock changed the countdown without a request, and the five-minute transition showed the stale timestamp. Screenshots: `/tmp/quota-countdown-preview/{320,375,1280}.png`. This is a component preview, not an installed-plugin acceptance run.
- Initial countdown review approved the full working-tree change against baseline `fb1059b13d14d1964cf6c87cae6a6f7ae0c74cd0`, including untracked files, with no blocking findings. Report: `/tmp/quota-reset-countdown-review.md`.
- User-authorized SDK follow-up: synchronized `@get-bb/plugin-sdk` from 0.5.9 to installed host version 0.5.29 using `bb plugin types` and updated the npm lockfile. `bb plugin types --check` now passes, as do all 61 tests, TypeScript, build, both bundled OAuth checks, and diff whitespace checks. No plugin installation or reload performed.
- SDK follow-up completion review approved with no findings. Reviewer independently verified SDK alignment, TypeScript, diff whitespace, and absence of unrelated dependency churn. Report: `/tmp/quota-sdk-review.md`. Installed-plugin acceptance has not been rerun.
- Subsequent user-authorized installation: `bb plugin install . --yes --json` succeeded. BB reports `codex-quota` running with a compatible SDK 0.5.29 frontend bundle. This verifies installation/load, not a fresh live quota acceptance run.
