# Design

## Context

See `proposal.md` for motivation and `specs/thread-snooze/spec.md` for the added behavior.

The companion `snooze-thread-subtrees` change extends the shared snooze policy to captured groups. The palette selects the focused thread as the subtree boundary and delegates membership, eligibility, and group wakes to that shared policy. This design does not override the companion's storage or wake rules, regardless of archive order.

- `app.tsx` currently registers only the sidebar thread-list slot. Its `ThreadList` calls `useSnoozes`, so snooze controls currently belong to a mounted list.
- `snooze-model.ts` already owns `canSnooze`, `activeSnoozes`, and local-calendar presets. `row-cues.ts` owns the blocking attention signals. The server's `snooze` and `wake` methods already handle persistence, read marking, and realtime publication.
- `useLiveRpc` represents an initial unanswered request as `null` but swallows load errors. `useSnoozes` substitutes an empty record before the first response. That is adequate for rendering a list, but is not proof that a thread is unsnoozed.
- The installed SDK exposes `app.commands.register` with synchronous `isAvailable` and asynchronous `run` callbacks. Their context contains the thread in view. The existing Tasks plugin demonstrates command registration without default bindings.
- The SDK also exposes `experimental_appOverlay`, which can host a headless React module while the plugin frontend is active. The package's existing minimum SDK version already includes these interfaces.

## Goals / Non-Goals

**Goals:**
- Keep one authoritative client snooze snapshot and one subscription owner per plugin frontend instance.
- Let command callbacks inspect current state synchronously without reading React hooks or fetching during palette filtering.
- Keep menu and command eligibility tied to the existing snooze model.

**Non-Goals:**
- Add a second snooze policy, a generic command framework, or a custom time picker.
- Change server storage, scheduled wake behavior, early-wake rules, or BB's palette implementation.
- Add snooze grouping to another sidebar provider.

## Decisions

### App-wide ownership of the snooze client module

Mount a headless state owner with `experimental_appOverlay`. It reads BB's current sidebar-thread data and owns the existing snooze RPC/realtime lifecycle. Publish a small shared snapshot and controls interface that the list consumes through a subscribed hook and the registered commands read synchronously. Clear the snapshot and callable controls on owner cleanup, and ignore late responses from a previous owner generation.

This is preferable to publishing controls from `ThreadList`, which would make commands disappear when the drawer or selected list unmounts. It also avoids separately calling `useSnoozes` from the list and overlay, which would duplicate loads and early-wake effects. Keep the state ownership and command adapters in focused modules rather than growing `app.tsx`.

### Readiness is distinct from an empty snooze set

The shared snapshot records successful thread and snooze loading separately from the snooze values. Initial loading, a failed required load, or loss of the owner makes command state unavailable. On a reconnect, reload required state before treating it as ready again. A successful empty response is ready; a substituted empty object is not.

Add explicit snooze load status through a narrow extension of the live-RPC hook or a snooze-specific wrapper. Preserve existing summary consumers and their behavior. The sidebar can retain its last useful display during recovery, but commands must fail closed until readiness is established again. Test failed refreshes as well as failed initial loads.

### One applicability calculation for listing and execution

Register stable IDs `snooze-tomorrow`, `snooze-next-week`, and `wake-now`, with the titles in the proposal and no `defaultShortcut`. Keep command-specific applicability in a small adapter that reads the current snapshot and delegates policy to the shared subtree eligibility control, group-aware `activeSnoozes`, and `snoozePresets`.

Both `isAvailable` and `run` use that calculation with the context provided by BB. `run` reads again instead of retaining a thread, wake timestamp, or callbacks captured when the palette opened. Resolve presets by stable preset identity and recompute them at dispatch time; a missing Next week preset means no operation, not fallback to Tomorrow. A clock tick updates displayed expiry, while callbacks use the actual current time rather than a stale tick.

This keeps calendar and attention policy in their existing module. Duplicating the sidebar menu's conditions in three registration callbacks would allow the two entry points to drift.

### Use existing mutations and failure handling

Commands invoke the same snooze and wake controls as the menu. Do not add RPC methods or manually mark threads read in the command adapter. Refresh shared state after a successful operation and report operation failures visibly using the existing snooze failure messages. A failed operation is not represented as a successful local state change.

Keep applicability checks client-side for this change. They guard against stale state already observed by the client, not an atomic race between the final check and a server-side thread transition. Adding server-side attention validation would need a separate contract decision and is outside this scope.

## Risks / Trade-offs

- [A stale palette entry or shortcut bypasses a listing check] Re-check the latest context, snapshot, and date immediately before dispatch; test the entry directly after state changes.
- [An unloaded snooze map looks empty] Track readiness explicitly and hide commands until both required reads succeed.
- [Moving ownership duplicates early-wake calls or leaves old callbacks alive] Use one owner, generation-aware cleanup, and lifecycle tests with delayed responses and unmount/remount.
- [Snooze state changes while the palette stays open] Evaluate applicability whenever BB calls the availability callback and always guard execution. This change does not promise a new host-level continuous palette refresh mechanism.
- [Another sidebar provider is selected] Commands still operate while the plugin frontend is active, but only this plugin's list displays its Snoozed group. Document that existing limitation.

## Migration Plan

No persisted-data or RPC migration is needed. Build and reload the plugin after local verification. Check palette visibility and mutations in the installed plugin, including focused split panes and a closed sidebar. Rolling back the frontend change removes the commands while preserving existing snooze rows and server wake behavior.
