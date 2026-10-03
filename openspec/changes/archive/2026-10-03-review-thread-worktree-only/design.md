# Design

## Context

- See proposal.md, "Why".
- The SDK composer (`experimental_NewThreadComposer`, SDK 0.5.9) has no prop to lock the environment picker. `defaultEnvironment` only seeds it. The UI cannot stop the user from picking the project checkout.
- `startReview` RPC gets the full `NewThreadRequest`. `request.environment` is one of:
  - `reuse` (an existing environment id)
  - `project-default`
  - `host` with workspace `unmanaged`, `managed-worktree`, or `personal`
  - `provider` with `environmentProviderId` (on this machine: `project-checkout`, `git-worktree`, `personal-workspace`)
- The broken thread used `provider` + `project-checkout`.
- `ReviewComposer.submit` in `ui/review-composer.tsx` already shows a rejected `startReview` in an alert and rethrows, so the composer keeps its draft.

## Goals / Non-Goals

**Goals:**
- Stop new review threads from starting in an environment that other threads can share.

**Non-Goals:**
- Change how PR rows link to threads (option A from the exploration).
- Repair review threads that already run in a shared environment.
- Hide or filter choices in the composer's environment picker.

## Decisions

### Reject, do not override

`startReview` throws `Review threads need a new worktree` and spawns nothing.

- Alternative: replace the environment with a new worktree without telling the user. Rejected: the user's choice disappears without a sign, and a silent swap is hard to debug.

### Deny list of shared environments, not an allow list

Reject these, accept all others:

| `environment` | Why rejected |
|---|---|
| `reuse` | joins an environment that already has a thread |
| `project-default` | the server cannot tell what it resolves to; on this machine it is the project checkout |
| `host` + `unmanaged` | the project checkout |
| `host` + `personal` | shared personal workspace |
| `provider` + `project-checkout` | the project checkout |
| `provider` + `personal-workspace` | shared personal workspace |

- Alternative: allow only `host` + `managed-worktree` and `provider` + `git-worktree`. Rejected: it also blocks providers that make a new isolated environment per thread, for example a remote sandbox. Those are safe.

### Check in the service, not in `server.ts`

Put a pure `sharedEnvironment(environment): boolean` check in `queue/` and call it at the start of `startReview` in `review-queue-service.ts`. The service already owns review start and has unit tests. `server.ts` stays a thin SDK adapter.

## Risks / Trade-offs

- [A new provider shares a checkout but is not on the deny list] → It passes the check. Add its id to the list when it shows up.
- [Provider ids are strings from other plugins] → If `environment-project-checkout` renames its id, the check misses it. Keep the ids in one constant with a test per id.
- [The user picks the project checkout on purpose] → They get an error and must pick a worktree. This is the point of option B.

## Migration Plan

- No data migration.
- The existing review thread `thr_n6v3ncr62f` stays linked wrongly. The user archives it from the `#25727` row and starts a new review.
- Rollback: revert the check.
