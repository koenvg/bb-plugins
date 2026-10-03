# Design

## Context

See `proposal.md` for motivation and `specs/` for the behavior contract.

`MergeActionButton` is used in the PR tab and composer banner. Its `useMergeAction` hook stores operation state and a running guard in each hook instance. Sharing the button implementation does not share those values. The server's `createMergeWrites` validates cached action and head commit, performs the GitHub write, and refreshes insight. It does not coordinate the two UI instances.

`ui/commands.ts` currently opens the PR tab before posting a merge intent. `usePrCommands` consumes that intent inside the tab. The existing `ThreadBanner` mounts for the thread even when it returns no visible banner, and already loads PR insight. It can host palette confirmation and feedback without a new SDK slot. The existing availability map is only a synchronous palette-listing hint, not valid write input.

Design is required because this change crosses the command, tab, banner, and operation-state modules.

## Goals / Non-Goals

### Goals

- Put operation coordination at one seam that both button instances use.
- Give palette merge one chat-view owner, independent of which side-panel tab is selected.
- Keep transient command state tied to its source thread and prevent action replay.

### Non-goals

- No general command bus rewrite, shared cache rewrite, or new SDK extension.
- No cross-window lock, persistent operation history, or new server endpoint.
- Keep existing tab and banner click behavior, including explicit navigation through banner text.

## Decisions

### 1. Shared operation module with a small interface

Replace the per-instance operation state with a window-local module keyed by thread ID. Its interface supports reading/subscribing to an operation snapshot and running an action. Keep `useMergeAction` as the React adapter. The module owns the synchronous running guard, action kind, captured head commit, error, and RPC completion, rather than leaving those responsibilities with each button.

Set running state before awaiting the RPC. All callers observe one snapshot and one guard. A second request for the active operation does not send another RPC. Record the action kind in the running snapshot so both buttons show the same busy label even if PR data changes. Keep errors tied to the captured head commit. Clear obsolete errors when current PR data changes or a new attempt starts.

Keep the operation until its promise settles even if the initiating button unmounts. Remove idle entries with no subscribers when safe. Active work must not lose its guard when subscriptions change. Test independent threads and subscription cleanup.

Alternative: lift state into a React provider. The registered tab and composer slots do not currently share a plugin-owned React ancestor, so this would require a broader app integration change. Alternative: add a server progress channel. That would add a contract and lifecycle for cross-window behavior that is outside scope.

### 2. Route palette merge to the thread banner, not the PR tab

Give merge a dedicated thread-scoped intent path. `commands.ts` posts it without calling `openPanel`. Keep the current tab intents for refresh, open-on-GitHub, and submit review. Remove palette merge consumption from `usePrCommands` so an open tab cannot handle it a second time.

Handle the merge intent in `ThreadBanner` before any early return for hidden, missing, or failed insight. Extract the existing confirmation dialog presentation from `MergeActionButton` for reuse by the banner-owned palette flow. Keep one palette dialog per source thread and retain existing button dialogs for direct clicks. All writes use the shared operation guard. Repeated palette commands during preparation or confirmation are ignored; commands during a running write use the existing shared progress.

Consume each command once. Use the existing short-lived, in-memory pending-intent pattern, but do not replay a consumed intent on remount. Cancel pending preparation and close an unconfirmed palette dialog on source-thread unmount. Ignore late preparation results. A sent write continues for the original thread. No intent survives a restart.

Alternative: post the existing PR-tab intent without opening the panel. That fails when the tab is not mounted. Alternative: open and immediately close the panel. That still changes layout and focus and does not meet the requirement.

### 3. Prepare from a fresh load and freeze confirmation input

On a palette intent, use the existing `refresh` RPC to load current insight rather than the availability map or an earlier result. Keep a thread-scoped preparation guard before starting that request. Inspect refresh errors, including errors attached to retained good data; do not proceed from fallback stale insight.

The refresh owns its pending read. Realtime reload signals received during that read are coalesced and reconciled after the response, before preparation continues. This prevents the server's own publish-before-response signal from cancelling the palette action. Reconciliation returns the latest cache load, not an obsolete refresh snapshot; a newer explicit refresh or thread change still invalidates the older attempt.

Only a successful, current load with a runnable action can open confirmation or enqueue. Capture PR number, title, method, and head commit for that attempt. Later insight updates must not retarget an open confirmation. If current data invalidates that action, cancel it or show an error rather than silently changing the target. Direct button clicks retain their existing shown-head behavior.

Use the existing `runMergeAction` request and server validation. GitHub's expected-head guard remains the final check against a push after preparation. Keep the server's refresh-after-write and realtime insight update path.

Alternative: use only remembered availability. That is cheap but cannot detect new blockers and does not preserve the existing load-before-action guarantee.

### 4. Banner feedback is independent of normal banner visibility

Render operation and palette feedback separately from the normal `bannerState` result. Feedback takes priority while preparation or a write is running, so the banner does not continue to say "Ready to merge". Keep the compact action disabled while running when it is present. After refreshed merged or queued insight arrives, show the normal result state.

Render load errors and unavailable reasons even when normal banner logic would return null. Show a dismiss control for such feedback; a new attempt replaces it, and a newer relevant PR/head result supersedes obsolete feedback. Render operation errors as alerts. Never navigate automatically on preparation, confirmation, cancel, success, or error. A user can still explicitly open the PR tab from its command or normal banner text.

Alternative: use a toast or open the tab only on error. Both move feedback away from the confirmed chat-banner location; the latter also violates the no-panel requirement.

## Risks / Trade-offs

- Shared mutable state can leak between threads or tests. Use thread-scoped snapshots, stable subscriptions, explicit cleanup, and deterministic tests through the module's interface.
- A component can unmount while an RPC is pending. Cancel only unsent palette preparation; retain a sent operation and ignore stale view callbacks.
- Fresh preparation adds a read before a palette action. Show loading in the banner and keep duplicate-command protection active during the read.
- A stale ready button can still exist during a realtime update. The shared running guard prevents overlapping writes; cached-action and GitHub head checks still reject invalid requests.
- A successful write with a failed follow-up refresh can leave old PR data visible. Preserve the current server warning behavior; do not treat a completed merge as a failed write or automatically retry it.
- The composer slot is assumed to remain mounted for the current thread, even if it shows no normal banner. Verify the real BB UI with closed and open side panels before calling the change complete. Do not fall back to automatic panel opening.

## Migration Plan

No data migration or dependency update is needed. Implement and verify within `bb-plugin-github-insight`. Update its README and overview to replace the documented separate busy states and panel-first merge behavior.

Run UI tests, type checking, and plugin build. Check the live BB UI with a closed side panel and with Review selected. Use deterministic test responses for failure cases; do not merge a real PR solely for verification without explicit user approval.

Rollback by reverting the plugin change and rebuilding. Existing RPC requests and stored insight remain compatible. No installation is part of this planning workflow.
