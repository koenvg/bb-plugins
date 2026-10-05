# Tasks

## 1. Footer attachment and compatibility boundary

- [x] 1.1 Record the pre-implementation commit and inspect the running BB footer/navigation markup in Arc against the identities described in `design.md`; capture a baseline desktop/375px view and a bounded DOM fixture proving that the quota target can be distinguished from Settings, Debug, and another plugin without localized labels or positional selectors.
- [x] 1.2 Add failing adapter tests, then implement the scoped content-script adapter and attachment state. Verify owned-container creation, per-sidebar identity, idempotent reconciliation, late mounting, sidebar replacement, and preservation of BB-owned nodes with focused DOM tests.
- [x] 1.3 Add readiness-gated upper-entry suppression, focus handoff, and complete disposal. Verify tests for missing/ambiguous/hidden targets, portal or callback loss, repeated disposal, preserved user preferences, restored description references, and zero leftover nodes/styles/observers; document the markup dependency and fallback contract beside the adapter.

## 2. Native footer control and shared quota display

- [x] 2.1 Extend SDK integration tests to fail for the missing footer behavior, then register the native action and app-wide overlay while retaining the `quota` nav panel. Verify dashboard navigation, coalesced startup activation, cancellation on teardown, and restoration of normal navigation when the overlay unmounts.
- [x] 2.2 Render the shared quota badge into the adapter's owned container and add only quota-scoped layout styling. Verify presentation tests for fresh `0%`, `72%`, `100%`, stale, pending/loading, missing selection, unavailable and expired states, dynamic accessible details, and absence of a persistent product-name label.
- [x] 2.3 Extend `app.test.tsx` to verify that footer-only mounting initializes quota, dashboard and footer share selection and in-flight reads, focus revalidates the account, old-host results cannot appear, and freshness changes without a new fetch timer; run the affected view, selection-store, and SDK integration tests until green.
- [x] 2.4 Build and load an early preview from this checkout, preserving the installed plugin ID and selected host. Check icon-plus-`100%`, stale/placeholder widths, hover/focus persistence, and neighboring controls in desktop, narrowed sidebar, and 375px open drawer before the full validation suite; update `README.md` with placement, percentage meaning, compact behavior, and the markup-dependent fallback.

## 3. Complete-change validation and handoff

- [x] 3.1 Run `npm test`, `npm run typecheck`, `bb plugin types --check`, and `npm run test:bundle` from `bb-plugin-codex-quota` against the complete diff. Verify the public-SDK scan passes, fresh/refresh synthetic OAuth bundles pass, and no BB core changes, private imports, new dependencies, or new quota polling were introduced.
- [x] 3.2 Verify the installed plugin in signed-in Arc with Provider usage disabled: real selected-host quota, dashboard access by click/Enter/Space, compact-drawer dismissal, unchanged host selection/countdowns/official link, sidebar close/reopen, footer hiding and navigation fallback, and reload plus disable/re-enable cleanup. Append versioned evidence and screenshots to the task's acceptance record, separating fixture-covered failures from live observations and recording any blocked check. **User-approved acceptance limitation:** no-page-refresh disable/re-enable cleanup remains unverified in BB 0.44.0. The user approved closing with this limitation documented and no BB core/SDK changes. Harness disposal coverage is not claimed as live verification.
- [x] 3.3 Run the required single fresh-context, read-only completion review against the recorded baseline, including untracked files. Resolve blocking findings, rerun affected verification, and update these task checkboxes and acceptance notes; completion requires the returned review and honest reporting of any remaining gate.

## Implementation evidence

- Baseline commit: `6f0abf5cdbde6025b24f1d8f6600e591f76ca9b5`. Existing suite: 61 tests across 9 files passed.
- Arc baseline captured at 1615x990 and 375x812. Local screenshots: `/tmp/codex-footer-before-desktop.png` and `/tmp/codex-footer-before-mobile.png`.
- Live identities: `[data-sidebar="sidebar"]`, `[data-sidebar="footer"]`, `data-footer-item="plugin:<plugin-id>/<item-id>"`, and `data-sidebar-navigation-item="codex-quota/quota"`. The normal navigation entry is a button, not an anchor. Sanitized fixture: `bb-plugin-codex-quota/footer-fixture.test-support.ts`.
- Footer integration coverage is in the dedicated `footer-app.test.tsx` rather than enlarging the existing dashboard test file. The early pointer preview caught and fixed React portal click interception before the full validation run.
- Installed preview uses this checkout. Historical screenshots, observations, and fixture/live distinctions remain in Git history.
- Live lifecycle limitation: the open BB 0.44.0 tab did not observe CLI disable/re-enable registry changes, including its native footer registration. It needed a page refresh for rebuilt code. No-page-reload teardown remains a live verification gap; harness disposal/remount tests pass.
- The single read-only completion review returned one P2 finding: native Radix tooltip updates removed the quota's `aria-describedby` reference. The adapter now observes that attribute and restores only its missing token, preserving current host references without repeated writes. `footer-tooltip.test.tsx` reproduces the original failure with a real Radix trigger and passes after the fix, including open/close, idempotence, and disposal.
- Post-review validation: 77 tests across 12 files, typecheck, SDK pin/public-import checks, build, and synthetic bundled OAuth checks pass. The rebuilt installed plugin retained quota details in Arc's accessibility tree during one native tooltip open/close cycle. No second review was run for the original footer work. The user approved closing task 3.2 with the live lifecycle verification gap documented.

## 4. User-requested battery icon follow-up

- [x] 4.1 Replace the quota glyph with a registered battery icon whose fill follows fresh, idle remaining allowance. Reuse the existing shared store and freshness rule, with an empty outline for unknown, pending, loading, stale, or expired data. Add presentation and SDK integration regressions before implementation; retain native accessibility, activation, and the percentage.
- [x] 4.2 Preview the battery and 0%/low/medium/full/unknown states at native footer size in desktop and compact layouts, verify native activation and description references, and run the affected full validation. Update documentation and installed evidence.
- [x] 4.3 Run one fresh read-only completion review for this new battery request, resolve findings, and rerun affected checks. The earlier footer review is complete and is not being repeated as a fix-review pass.

Battery follow-up baseline: HEAD `6f0abf5cdbde6025b24f1d8f6600e591f76ca9b5`, with the already-implemented footer as pre-existing working-tree changes. Pre-battery copies of affected source/test/manifest files and the tracked diff are saved at `/tmp/codex-quota-pre-battery/` for the follow-up review.

Battery validation: 85 tests across 12 files, typecheck, SDK pin/public-import checks, build, and synthetic bundled OAuth checks pass. Installed Arc showed a matching 71% fill, native icon click/Enter navigation and drawer dismissal, preserved host selection, and intact accessible descriptions. The historical acceptance report distinguishes the live compact screenshot from the rendered component's fixture-value specimen.

The battery review found one P2 issue: a passive icon could retain fill after its quota owners unmounted and stopped advancing the clock. `QuotaSelectionStore` now tracks active quota-owner lifetimes, and the icon requires an active owner to show fill. Regression tests failed before the fix and now cover partial/final owner teardown, retained and newly mounted icons after six minutes and 24 hours, revalidation on return, late read completion after teardown, idempotent release, and no additional icon timers or requests.

Post-review validation: 88 tests across 12 files, typecheck, SDK pin/public-import checks, build, and both synthetic bundled OAuth checks pass. The updated installed Arc footer showed matching 69% text/fill after reselecting the same host following backend reload. The code finding is resolved; no second battery review was run. The previously user-approved live lifecycle verification limitation remains documented.
