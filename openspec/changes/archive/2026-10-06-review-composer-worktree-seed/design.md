# Design

## Context

- `ui/review-composer.tsx` passes `defaultEnvironment = { type: "host", workspace: { type: "managed-worktree", baseBranch: { kind: "default" } } }` to `experimental_NewThreadComposer`.
- `hostId` is optional in the SDK schema. The bb 0.45 composer turns a `host` seed into a picker selection only when `hostId` is set. With no `hostId` it seeds nothing, and the picker falls back to the project checkout.
- The SDK app surface has no hook that gives the primary host ID. The server has it through `bb.sdk.system.config().primaryHostId`, which is already wired as `primaryHostId()` in `server.ts`.
- `defaultEnvironment` is value-compared on each render. A change after mount re-seeds every selection.

## Goals / Non-Goals

**Goals:**

- The seed reaches the picker on the current bb host.
- A test fails if the seed has no `hostId`.

**Non-Goals:**

- Changes to `isSharedEnvironment` or to how `startReview` rejects shared environments.
- A workaround for drafts saved before this fix.
- A fix in bb itself. A bb issue report about the docs mismatch is optional follow-up.

## Decisions

### Get the host ID through a new RPC, `getPrimaryHost`

`rpcContract` gets `getPrimaryHost: { input: {}, output: { hostId: string | null } }`. The server answers from `bb.sdk.system.config()`.

Alternatives:

- Add `hostId` to `ReviewQueueView`. Rejected: the view is persisted (`storedReviewQueueSchema`, `v: 2`). Adding a field needs a version bump, and the `relink` path that rebuilds the view would also have to keep it. The stored value can also be old when the primary host changes.
- Seed `{ type: "provider", environmentProviderId: "git-worktree", ... }`. Rejected: it depends on bb's internal provider ID and input shape.

### Render the composer only after the host lookup settles

`ReviewComposer` calls `getPrimaryHost` on mount and shows the existing loading notice until the call returns. Then it mounts `NewThreadComposer` with the final seed.

Rendering at once and adding the seed later would re-seed after mount. A re-seed resets selections the user has already changed. Waiting avoids this.

- `hostId` is a string: seed `{ type: "host", hostId, workspace: { type: "managed-worktree", baseBranch: { kind: "default" } } }`.
- `hostId` is null, or the call fails: mount with no `defaultEnvironment`. Submit-time validation still guards against shared environments.

## Risks / Trade-offs

- [The host lookup adds a round trip before the composer shows] → A local RPC call is fast. The page already waits for the queue view.
- [A draft saved under the same `draftKey` can keep an older environment] → Out of scope. The user can change the picker, and submit-time validation catches shared environments.
- [A later bb version can accept a `host` seed without `hostId`] → The explicit `hostId` still works. No change needed.
