# Tasks

## 1. Shared environment check

- [x] 1.1 Add `queue/review-environment.ts` with `sharedEnvironment(environment)` and the deny list from design.md. Verify: `queue/review-environment.test.ts` has one case per row of the design table (true) and cases for `host` + `managed-worktree`, `provider` + `git-worktree`, and an unknown provider id (false). `npm test` passes.

## 2. Reject shared environments in startReview

- [x] 2.1 In `queue/review-queue-service.ts`, make `startReview` throw `Review threads need a new worktree` before `spawnReviewThread` when `sharedEnvironment(request.environment)` is true. Export the message as a constant next to `NOT_A_REVIEW_THREAD_MESSAGE`. Verify: new test in `queue/review-queue-service.test.ts` shows the throw, no spawn, and no publish for `provider` + `project-checkout`.
- [x] 2.2 Give the existing `startReview` tests in `queue/review-queue-service.test.ts` a new-worktree `environment` (today the request is `{ projectId }` only). Verify: `npm test` passes.
- [x] 2.3 In `server.test.ts` `describe("startReview")`, add a case that calls the RPC with `environment: { type: "provider", environmentProviderId: "project-checkout", inputs: {} }` and expects a reject with the message and no `threads.spawn` call. Verify: `npm test` passes.

## 3. Composer error

- [x] 3.1 Confirm the composer shows a rejected `startReview` in an alert, keeps the draft, and does not navigate. Verify: the existing test "keeps the draft and shows the error when the start fails" in `ui/pull-requests-panel.test.tsx` covers this for any error message, so no new test.

## 4. Docs and checks

- [x] 4.1 In `README.md` ("Review in thread" bullet near line 74) and `PLUGIN_OVERVIEW.md` (line 17), add one sentence: review threads start only in a new worktree, and other choices show "Review threads need a new worktree". Verify: both files contain the sentence.
- [x] 4.2 Run `npm run typecheck` and `npm test` in `bb-plugin-github-insight`. Verify: both pass.
- [x] 4.3 Manual check in bb: open "Review in thread" on a PR, switch the environment to Project checkout, submit. Verify: the alert shows and no hidden thread appears in `bb thread list --project <id> --json`. Then submit with a new worktree and confirm the thread starts.
