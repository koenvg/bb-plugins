# Tasks

`design.md` is deliberately omitted. This is a local result-mapping fix with no architecture, dependency, or data model change. Use the existing `no_pr` handling rather than adding UI-only error suppression or another result type.

## 1. Missing-remote result mapping

- [x] 1.1 Add regression cases in `bb-plugin-github-insight/server.test.ts` for an unavailable lookup with `gh pr view failed: no git remotes found`, both on first load and after a good PR reading. Verify that each returns `no_pr`, makes no additional GitHub host call for the missing-remote result, and removes the thread's previous PR summary. Confirm the new cases fail before the fix.
- [x] 1.2 In `bb-plugin-github-insight/pr-lookup.ts`, map only the specific `no git remotes found` diagnostic in an unavailable result to `no_pr`. Keep other unavailable results as errors, and add no Git command or retry path. Verify the new server tests pass and existing missing-`gh` and signed-out error tests still pass.
- [x] 1.3 Document missing-remote handling in `bb-plugin-github-insight/README.md`. Verify the text says the composer banner is hidden, the PR tab uses its no-PR state, and other failures remain visible.

## 2. Integration checks

- [x] 2.1 Run the GitHub Insight test suite and typecheck with the package's existing scripts. Confirm the rendered tests in `ui/insight-status.test.tsx` still show an empty banner for `no_pr`, remove a previous snapshot, and keep errors with Retry for other failures. Verify no composer rendering or result-schema change is needed.
