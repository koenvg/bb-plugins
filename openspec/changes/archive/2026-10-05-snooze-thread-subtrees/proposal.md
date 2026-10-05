# Proposal

## Why

Snoozing a parent currently leaves its children in the attention tabs and shows the parent again as a dimmed context row. The user wants to put the parent and its descendants away together, and bring them back together when any member needs attention.

## What Changes

- Snooze the selected thread and its existing active, non-hidden descendants at every depth as one group, with one wake time. Preserve their nesting in Snoozed and remove all group members from Needs attention and In flight.
- Mark every group member read without stopping running work.
- Wake the whole snooze group when any member is manually woken, reaches the shared deadline, or receives an existing early-wake signal, including approval, answer, failure, and run completion.
- Check blocking attention signals across the selected subtree before allowing snooze, so a parent's action cannot hide a child that already needs the user.
- Keep unrelated threads, ancestors of a selected child, and siblings outside the selected subtree unchanged. Keep PR-only changes from waking a snooze group.
- Apply the same behavior to sidebar menus and command-palette actions, backed by server-side group persistence and realtime updates.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `thread-snooze`: Change per-thread snooze and wake behavior to shared subtree groups, including eligibility, read marking, group display, and early wake propagation.
- `sidebar-thread-tabs`: Exclude all snoozed subtree members from the attention tabs and restore them through the existing tree-tab rules when their group wakes.

## Impact

- `bb-plugin-pr-thread-list`: `snoozes.ts`, `snooze-store.ts`, `contract.ts`, `snooze-model.ts`, `use-snoozes.ts`, `snooze-client.tsx`, `snooze-commands.ts`, `thread-actions.ts`, and their tests. Verify integration with `list-model.ts` and `app.tsx`.
- Add a database migration for shared snooze membership. Preserve the existing RPC action inputs and wake-time presets; extend the snooze snapshot with group membership.
- Replace the main spec's explicit rule that child signals cannot wake a parent. The existing `thread-snooze-command-palette` change is still in progress, although its implementation is present in this checkout; reconcile its planning artifacts when applying or archiving these changes.
- Document the existing limit that approval and queued-message attention signals are observed by an open plugin frontend. Scheduled wake and server run-completion/failure events continue to work without a client.
- No BB core changes, new dependencies, automatic snooze inheritance for children created after the action, or changes to PR/tab classification are planned.
