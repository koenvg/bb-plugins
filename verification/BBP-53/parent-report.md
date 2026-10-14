# BBP-53 parent validation

## Result

Delivery 1 is implemented. BBP-53 remains in_review. The independent review requested changes for missing CI build tooling and listbox focus protection. The parent inspected both fixes and reran affected checks successfully. The original review is preserved in review-report.md, with fingerprint 4a145b1046637677c819e7604e3a98669e59286918e8e42133c28dcab33b53fe. Finding closure is not a new reviewer approval.

## Verified by the parent

- parent-checks.log records 4 shared public-interface tests, 124 Tasks test files with 1284 tests, 8 Chromium browser tests, both typechecks, scoped lint and format, SDK 0.6.37 check, and diff whitespace checks. Exit code 0. Four baseline lint warnings remain.
- parent-build.log records an isolated BB_DATA_DIR build with BB_CLI unset, locked local bb-app 0.46.0, SDK type check, and actual app/server build metadata 0.46.0 and SDK 0.6.37. Exit code 0.
- The parent read the final 1280 px and 390 px PNGs and geometry JSON. The filename and controls fit. Wide code and tables stay within the reading area. Loading and ready panel, toolbar, and body rectangles are identical.
- The parent inspected hasOpenOverlay and the owner focus callback. Both now use one dialog, alertdialog, menu, and listbox policy. Exclusion affects only the supplied owner panel, and shortcut callers retain all active-overlay checks. Desktop and compact listbox focus tests pass.

## Reported evidence inspected

review-closure.md and its logs record frozen clean builds on macOS and Linux ARM64 without ambient BB. Linux used Node 24.21.0 and Bun 1.4.3 with native prerequisites. The official pinned CLI produced app/server bundles with common code and CSS and consumer-owned React. Registry signatures, provenance, and lockfile integrity were checked. Deliberate red tests reproduce the compact shortcut bug, the reviewed listbox focus theft, and shared-test failure stopping consumer setup. Final source was restored in disposable checkouts. These are not worktree test failures.

## Remaining gates and limits

- Task 1.4 remains open. Actual host middleware denial has not been verified. SDK fake-host route registration bypasses authentication. The real route explicitly uses local authentication.
- Task 1.2 remains open for hosted CI execution. Its Node 24 Linux command sequence and fail-fast behavior passed, but GitHub Actions and the x86-64 hosted runner have not run.
- Tasks 1.1, 1.3, and 1.5 through 1.11 have completion evidence. Frozen Bun replaces npm ci by explicit user approval.
- Browser tests use actual preview, grid, dialog, and shortcut components with synthetic local transport, not an installed full Tasks session. Full Tasks rendered tests verify editor identity, draft, in-flight save, route, scroll, and workflow. Installed-host behavior and mobile software keyboard remain unverified. Original download bytes and disposition are covered by route tests; browser download activation is not claimed.
- Later comment, heading, safe-link, highlighting, full presentation, and production-reader integration deliveries remain untouched. All document destinations are inert in this delivery.

## Installation and task state

No plugin source or enabled-state change, user-data deletion, live test record, commit, PR, or publication ran. Tasks remains enabled from path:/Users/koen/workspace/bb-plugins/bb-plugin-tasks-plus. This thread remains attached to BBP-53. Authentication verification needs explicit approval to temporarily load this checkout and then restore the original source without uninstalling or deleting data. No cleanup follow-up remains for the two fixed review findings.

Evidence is relative to this directory. The implementation baseline is 939bd318cedb00239b73e1fd1c3d5d90c79ada70.
