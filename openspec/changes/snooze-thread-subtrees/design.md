# Design

## Context

See `proposal.md` for motivation and the two delta specs for the behavior contract.

- `snooze-store.ts` stores independent rows keyed by thread ID. `snoozes.ts` marks one thread read, stores one deadline, and deletes one row for each wake or lifecycle event.
- `list-model.ts` already builds nested Snoozed trees from the snoozed-ID map. The missing descendant IDs cause the reported dimmed parent to remain in an attention tab; hiding that context row would hide useful navigation without fixing snooze semantics.
- `use-snoozes.ts` observes blocking signals in the app-wide frontend owner. Server `thread.idle` and `thread.failed` events work without a client; approval and queued-send signals currently depend on an open frontend.
- Menus and palette commands share mutations but currently inspect only the selected thread. The palette's `activeSnoozes([thread], ...)` call loses sibling signals and must stop using a single-thread projection.
- The repository already uses `sdk.threads.list` for server reads. This checkout has no installed SDK dependencies, so exact thread field adapters must be checked against the pinned SDK during implementation, not invented in this plan.

## Goals / Non-Goals

**Goals:**

- Put membership selection and group-wide wake calculation behind a focused snooze module, rather than adding tree exceptions to each UI entry point.
- Keep one durable membership identity for manual wake, server events, frontend signals, and deadline processing.
- Preserve current tree rendering and existing action inputs where possible.

**Non-Goals:**

- A generalized tree state framework or changes to PR classification.
- Continuous membership inheritance when a new child is created or a thread is reparented after snoozing. Membership is captured when the action succeeds.
- A new server-only approval-monitoring system, or atomic rollback of BB read-state SDK calls.

## Decisions

### Resolve the selected subtree once per action

Use a small pure selector over normalized thread IDs, parent IDs, lifecycle, and visibility. Walk descendants iteratively with a visited set. Traverse relationship records to find deeper descendants, but include only active, non-hidden members; archived and hidden records themselves never receive a snooze or a read update. A selected child is the boundary, so its ancestors and siblings are not affected.

The server resolves membership from SDK thread data, not a client-supplied list or rendered rows. Obtain the relationship graph needed for traversal, including excluded intermediates where supported. Frontend eligibility uses complete loaded relationship data and the latest sidebar attention signals; absent required relationship data is not an empty eligible subtree. Keep the selector independent of React and of the list's project/pin/group decisions. Extend the shared state read narrowly if the current sidebar hook cannot provide the required relationships.

Alternative: send one snooze RPC per visible child. Rejected because collapsed or offscreen children would be missed, failures would create partial groups, and wake propagation would have no durable membership.

### Store a group identity on each snooze row

Add a `group_id` column and an index in a forward database migration. Every successful action gets a fresh group identity, and all included member rows share its `wake_at` and `snoozed_at`. A transaction replaces selected rows together. Existing independent snoozes become singleton groups without changing their deadlines or read states.

Keep `snooze({ threadId, wakeAt })` and `wake({ threadId })`. Extend `listSnoozes` with a thread-to-group mapping alongside the existing thread-to-deadline mapping. Membership must be returned from one database snapshot. Require coherent group state before enabling new frontend actions.

The owner requests both lifecycle datasets and drains the SDK's archived pagination, because excluded archived ancestors can connect active grandchildren. Subtree mutations remain unavailable until archived relationship data is complete; observed attention in active members can still trigger a stored-group early wake while those pages load.

Snoozing an awake ancestor replaces any existing descendant snoozes with the new group. Members outside the selected subtree keep their existing state if a prior group has been split by reparenting. A group identity is not a root thread ID, so archiving or deleting the original root does not strand other members.

Alternative: infer groups from equal timestamps or current ancestors. Rejected because unrelated snoozes can share a deadline, and ancestry changes or a restart must not change which stored members wake together.

### Commit snooze membership only after read updates succeed

Validate the deadline and required thread data first. Apply the latest observed subtree blocking policy before dispatch, then resolve server membership and mark included members read. Only after all required read calls succeed should the server replace snooze rows transactionally and publish one change signal.

If a read call fails, retain the previous snooze rows and report failure. Earlier successful read calls cannot be rolled back atomically through the current SDK, so some threads may become read even though no new snooze is stored. Do not promise a rollback of those external read changes. Running members continue running.

Reuse the frontend's existing attention policy and fail-closed readiness checks. This preserves the existing limitation that a thread transition after the last observed state is not an atomic server attention check. If such a transition is observed after commit, the ordinary group early-wake path ends the group snooze.

Start terminal-event capture when the action is accepted, before queuing or fetching hierarchy pages. Reconcile those events against the resolved member IDs so unrelated threads cannot cancel the action. Continue capturing events through read updates and commit, and exclude members removed by lifecycle events while the action is pending. Before publishing a committed group, end it immediately if any included member signalled completion or failure.

Alternative: store first and roll back on failure. Rejected because clients could observe a partial operation and rollback could overwrite a newer user action.

### Wake by stored membership, not ancestry

Give the store distinct operations for ending a member's whole group and removing only one member. Manual Wake now and server completion/failure events end the member's group in one transaction and publish once. Archive/unarchive cleanup removes only the affected member and never restores it.

For frontend blocking signals, calculate affected group IDs across the full snapshot. Exclude every member of an affected group from the effective snoozed map immediately, and issue one wake request per group. Keep retry/deduplication at group scope. Both menus and commands read this same effective state. Waking does not mark other members unread; BB's triggering thread retains its own attention and unread signals.

One server lifecycle coordinator serializes snooze read/commit operations and deadline sweeps. A replacement snooze waits for an in-flight unread operation, then marks its members read, so a stale sweep cannot overwrite the replacement's read state. A sweep captures due identities and members within that queue, checks captured ownership immediately before each unread call, and conditionally deletes those groups afterward. Continue after a deleted member's failed unread call. Manual and terminal wakes remain immediate and cause the remaining ownership checks to fail. Multiple clients and repeated events are idempotent.

Alternative: wake only the signaling child and let its parent render as context. Rejected by the agreed requirement that snoozing and waking keep the subtree together.

### Keep existing tree rendering

Continue passing the effective per-thread snoozed map into `visibleItems`. With every selected member in the map, the existing Snoozed forest should already preserve nesting and remove the whole group from attention membership. Change list construction only if focused regressions show missing or duplicate member rows.

Keep dimmed ancestor context for an independently snoozed child under an awake parent, and for awake threads outside a captured snooze group. After a group wakes, use current tab rules rather than forcing every tree into Needs attention. A running tree with no attention-pulling member returns to In flight.

Alternative: treat an ancestor's snooze as a rendering-only inherited flag. Rejected because it would not mark descendants read, persist their shared wake membership, or propagate child server events correctly.

## Risks / Trade-offs

- [An SDK read omits excluded intermediate parents] Check the pinned SDK's list filters and map all required relationship records; test descendants beneath archived or hidden intermediates. Do not silently snooze only the currently rendered subset.
- [A child completes or needs approval during the snooze operation] Recheck latest observed state before dispatch, apply group early-wake promptly, and test events interleaving with membership commit. This plan does not add an atomic server attention-validation guarantee.
- [Read updates partly succeed before a failure] Persist no partial new group, keep prior snoozes, report the failure, and document the external read-state limitation.
- [An older sweep races with a new snooze] Delete by captured group identity and deadline, not thread ID alone; retain the existing delayed-unread regression as a grouped test.
- [No frontend is open for approval or queued-send signals] Preserve and document the current detection limit. Server completion/failure and scheduled wake still operate without clients.
- [Palette planning artifacts still assume per-thread behavior] Update the shared implementation and tests, and reconcile the existing change's spec deltas before archival so archive order cannot restore obsolete eligibility text.

## Migration Plan

1. Add and test the forward group-membership migration, preserving existing rows as singleton groups.
2. Deploy server storage/RPC and frontend group interpretation together, then reload the plugin. Do not enable grouped actions against an old snapshot lacking required membership data.
3. Run the full plugin tests, typecheck, and build. Verify a nested parent snooze in the installed sidebar and palette, then verify manual, child-attention, completion, and deadline wakes.
4. For rollback, restore the previous plugin version. Keep the original snooze columns and their defaults compatible with old insert statements. Existing group rows remain ordinary independent snoozes under the old code. On re-upgrade, assign singleton groups to old-version inserts and dissolve groups with inconsistent deadlines or snooze timestamps caused by old-version updates. Preserve all row times and all untouched groups. Test both old inserts and old upserts against grouped members.
