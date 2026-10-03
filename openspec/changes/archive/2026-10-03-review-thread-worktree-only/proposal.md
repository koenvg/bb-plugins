# Proposal

## Why

A review thread can start in a shared environment, for example the project checkout. When another thread checks out a different branch there, the review thread's environment points to the wrong PR. Then:

- "Open thread" on `collibra/frontend#25727` opens a thread whose PR and Review tabs show `#25733`.
- The `#25733` row links to the review thread, not to the thread that owns `#25733`.

Seen on 2026-10-03: review thread `thr_n6v3ncr62f` (reviews `#25727`) ran in the `project-checkout` environment `env_65ngtstsyw`. Thread `thr_3mtfb23gtk` shares that environment and checked out `PUX-6708-lazy-assessment-answers` (`#25733`).

## What Changes

- `startReview` rejects a composer request whose environment can be shared with other threads. The composer shows the error and keeps the draft.
- Accepted environments: a new worktree (`host` + `managed-worktree`, or the `git-worktree` environment provider) and environment providers that are not known to share a checkout.
- Rejected environments: `reuse`, `project-default`, `host` + `unmanaged`, `host` + `personal`, and the `project-checkout` and `personal-workspace` environment providers.
- **BREAKING** (small): a user can no longer start a review thread in the project checkout.
- No change to how existing threads link to PR rows. Review threads that already run in a shared environment stay as they are. The user archives them and starts a new review.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pr-review-requests`: adds requirement "Review thread environment". A review thread starts only in an environment that no other thread can share. "Review in thread" does not change: it already seeds a new worktree.

## Impact

- `bb-plugin-github-insight/queue/review-queue-service.ts`: `startReview` checks the environment before it spawns.
- `bb-plugin-github-insight/server.test.ts` and `queue/review-queue-service.test.ts`: new tests for accepted and rejected environments.
- `bb-plugin-github-insight/ui/review-composer.tsx`: no code change expected. It already shows a failed `startReview` in an alert.
- No RPC contract change. No new dependency.
