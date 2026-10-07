# CI test timing fix

## Scope

The user approved updating PR #92 from `main` and fixing the failed Changes test. PR #92 stays unmerged.

- Starting head: `e9a9f694f9a417c27e9500bff977921e9b945ade`.
- Incoming main: `83e66d965c6ac59fb8645ff2c58790424fd84139`.
- Local merge: `b6feeaf9e85be1105d6628af72535bfa5668ee71`.
- Five GitHub Insight files conflicted with the incoming Oxc formatting migration. The resolution kept the PR-state behavior and applied Oxc formatting. The four executable/test files have matching TypeScript syntax trees before and after the merge when formatting trivia and redundant parentheses are excluded. The README keeps the lifecycle and queue descriptions.

## Fix

The failing test waited only for the Viewed checkbox to clear. A changed patch can clear that computed value before the stale-mark cleanup clears the saved collapse override. The expansion assertion could therefore run too early.

The test now waits for the full expected outcome: unchecked Viewed, expanded diff, updated counter, and the exact stale-mark removal request. It keeps all original assertions and the default timeout. No Changes production code was altered for this fix.

The CI failure is recorded at [the failed Changes job](https://github.com/koenvg/bb-plugins/actions/runs/37293723444/job/111709940021). The original test passed in 20 local focused runs, so the failure was not reproduced locally. The corrected test also passed in 20 focused runs.

## Validation

- Repository `npm run check`: passed, with 18 existing warning-level lint reports covered by the incoming configuration. Formatting passed for 805 files.
- Changes: 43 focused rendered tests and all 117 package tests passed; typecheck and build passed.
- GitHub Insight: all 956 tests passed; typecheck and build passed after the formatting merge.
- `git diff --check` and strict `pr-state-parity` OpenSpec validation passed.
- Required single read-only completion review for this CI follow-up: approved, with no findings. Reviewer run `04a98afd-7acd-46ed-a785-37ac0ff68a8d` checked the test fix and all five conflict resolutions. The reviewer also ran independent lint/format, diff, and strict OpenSpec checks. The reviewer did not repeat package tests, builds, or browser checks.

No installed plugin was replaced during this follow-up. The earlier installed build and its browser evidence remain recorded in `acceptance.md`. Browser checks were not repeated for the test-only fix or formatting-only conflict resolution. CI for the new PR head will run after push.
