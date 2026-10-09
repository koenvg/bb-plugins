# Tasks

## 1. github-insight: waiting check status

- [x] 1.1 Add `waiting` to `checkStatusSchema` and a `source` (`check_run` | `status`) field to `CheckCandidate` in `core/checks.ts`; verify existing `core/checks.test.ts` still passes
- [x] 1.2 Add `QUIET_STATUS_MS` and a function that turns quiet pending `status` candidates into `waiting` when no `check_run` candidate is running; verify with new `core/checks.test.ts` cases for the 4 scenarios of "Quiet pending status is waiting" (5 min quiet, 1 min quiet, check run running, check run never waits)
- [x] 1.3 Pass `now` into `collectInsight` from `server.ts` and apply the function from 1.2 before `toCheck`; verify an `core/overview.test.ts` case where a quiet "UI Review" status comes out `waiting`, and `npm run typecheck` passes in `bb-plugin-github-insight`

## 2. github-insight: blocker, auto-merge, banner

- [x] 2.1 Add `checks_waiting` to `blockerCodeSchema` after `checks_failed`, and build its text ("<name> waiting for you" / "N checks waiting for you") in `buildBlockers`; verify `core/blockers.test.ts` cases for one waiting check, two waiting checks, and the order after "1 check failed", and that waiting checks do not count as running
- [x] 2.2 Add `checks_waiting` to `WAITING_BLOCKERS` in `core/auto-merge.ts`; verify an `core/auto-merge.test.ts` case where only "UI Review waiting for you" gives the "enable" action
- [x] 2.3 Show the waiting blocker text in `core/banner.ts` before running checks; verify a `core/banner.test.ts` case
- [x] 2.4 Add `checks_waiting` to `ui/blocker-tone.ts` with `text-attention`; verify `npm run typecheck` passes

## 3. github-insight: PR panel and summary

- [x] 3.1 Add `waiting` to `OPEN_STATUSES` (order: failed, waiting, running) and `STATUS_ICON` with a non-spinning attention icon in `ui/pr-tab.tsx`; verify an `app.test.tsx` case that renders "UI Review" open without a spinner
- [x] 3.2 Confirm `core/summary.ts` emits `checks.waiting` and the `checks_waiting` blocker code with version 1; verify a `core/summary.test.ts` case with waiting 1 and running 0
- [x] 3.3 Update `bb-plugin-github-insight/README.md` (checks list and blocker list) to name waiting checks and the 3 minute rule; verify the text matches the spec wording

## 4. pr-thread-list: read and place waiting checks

- [x] 4.1 Add `checks_waiting` to `BLOCKERS` in `pr-insight.ts` and read `checks.waiting` as optional (default 0); verify `pr-insight.test.ts` cases for a summary with and without `checks.waiting`
- [x] 4.2 Add `checks_waiting` to `PROBLEMS` in `tabs.ts`; verify a `tabs.test.ts` case for "Check waits for the user" (waiting plus required review gives Needs attention) and that existing "Checks running" still gives In flight
- [x] 4.3 Add reason `checks_waiting` ("waiting for you", `waiting` tone, non-spinning mark, after `checks_failed`) in `pr-status.ts`; verify a `pr-status.test.ts` case for the row text and mark
- [x] 4.4 Update `bb-plugin-pr-thread-list/README.md` row and tab rules to include waiting checks; verify `npm test` and `npm run typecheck` pass in `bb-plugin-pr-thread-list`

## 5. tasks-plus: accept waiting checks

- [x] 5.1 Add optional `waiting` to `prChecksSchema` in `shared/contract.ts`; verify a tasks-plus test where a summary with `checks.waiting` parses and one without it still parses
- [x] 5.2 Add `checks_waiting` to `KNOWN` and derive it from `checks.waiting > 0` in `api/work-status-conditions.ts`; verify a test where a waiting summary gives the `checks_waiting` condition and no `unsupported_conditions`
- [x] 5.3 Add the "Checks waiting for you" label (after "Checks failing") and require `checks.waiting === 0` for "Ready to merge" in `views/list/pr-presentation.ts`, and show the waiting count in `views/list/pr-rich-detail.tsx`; verify presentation tests and `npm test` and `npm run typecheck` pass in `bb-plugin-tasks-plus`

## 6. Integration check

- [x] 6.1 Build both plugins, reload them in bb, and open a PR with a quiet pending commit status (or a test fixture); verify the thread moves from In flight to Needs attention within ~4 minutes after CI finishes and the PR panel shows "<name> waiting for you"
