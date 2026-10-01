# Tasks

## 1. Scoped composer workaround

- [ ] 1.1 Confirm the smallest shared composer DOM boundary for the custom banner and native context region in the installed BB UI; capture a representative fixture and normal/compact preview showing the PR badge, file controls, and available PR actions before changes.
- [ ] 1.2 Add failing regression tests through the existing frontend harness and host DOM fixture for badge-only targeting, two-pane isolation, unrelated links, banner absence/removal, and unrecognized host markup; verify the tests fail for the missing workaround rather than fixture errors.
- [ ] 1.3 Add the banner marker and narrowly scoped CSS with plugin-owned lifecycle cleanup; verify the regression tests pass, the existing banner availability tests still pass, and clicking the banner still opens the PR tab.
- [ ] 1.4 Document the temporary DOM dependency, conditional suppression, and rollback in bb-plugin-github-insight/README.md; verify the documentation matches the implemented selector and lifecycle behavior.

## 2. Integration validation and handoff

- [ ] 2.1 Run the full GitHub Insight test suite, typecheck, and plugin build against the finished diff; record results and resolve failures caused by the change.
- [ ] 2.2 Verify in the live UI at normal and compact widths that only the native badge disappears, file controls and available PR actions remain usable, separate panes remain isolated, and disabling the plugin restores native rendering; record screenshots and results without executing destructive PR actions.
- [ ] 2.3 Run the required single fresh-context read-only completion review against the pre-implementation commit, resolve blocking findings, rerun affected checks, and record final verification or remaining blockers.
