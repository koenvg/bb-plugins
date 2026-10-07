# Proposal

## Why

"Review in thread" opens the composer on the project checkout, not on a new worktree. The user must change the environment by hand. If they do not, submit fails with "Review threads need a new worktree". The plugin seeds a `host` environment without a `hostId`. The bb composer drops a `host` seed that has no `hostId`, and then uses its own default.

## What Changes

- The server gives the review composer the primary host ID.
- The review composer seeds a new worktree on that host, so the environment picker opens on "Worktree".
- When there is no primary host, the composer opens with no environment seed. Submit-time rejection of shared environments stays the same.
- A spec scenario states that the composer opens with a new worktree already selected.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pr-review-requests`: The "Review in thread" requirement gets a scenario: the composer opens with a new worktree selected, so the user does not need to change the environment.

## Impact

- `bb-plugin-github-insight/contract.ts`: a new RPC that returns the primary host ID.
- `bb-plugin-github-insight/server.ts`: registers the RPC with the existing `primaryHostId()` lookup.
- `bb-plugin-github-insight/ui/review-composer.tsx`: builds the seed with `hostId`.
- Tests in `ui/pull-requests-panel.test.tsx` and `server.test.ts`.
- No change to the stored review queue, to `startReview`, or to the shared environment check.
