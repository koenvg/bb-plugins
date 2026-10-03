# Design

## Context

See `proposal.md` for the motivation and the two delta specs for acceptance behavior. This design is needed because the change crosses host slot registration, routing, list rendering, shortcut dispatch, and editable detail lifetime.

Observed before the original implementation:

- `app.tsx` registers `TasksAppShell` as the main Tasks panel and `TasksNavigationPanel` as a fixed Navigation tab. The separate host tab is the right-hand project navigation in the supplied screenshot.
- `shell/routes.ts` currently resolves both an empty entry and an explicit `all` destination to the same route. Task routes carry only a task key. `lastBrowseRouteRef` in `shell/app-shell.tsx` keeps return context only while mounted.
- `shell/view-preference.ts` already remembers list/board mode. `views/list/list-preference.ts` already stores filters and sort per scope, even though the README's limitations section says filters are local-only. `expanded-tasks` and `scroll-restoration` already own their respective preferences.
- `ListView` builds the filtered tree and actual visible order, including expanded subtasks and dimmed parents. Its click/open handlers currently navigate to a standalone task route. Keyboard helpers move DOM focus, not a shared selection.
- `DetailView` already implements the editable ticket. It queries by key and renders `TaskDetail`; rebuilding a read-only preview would duplicate functionality unnecessarily. Detail properties already switch between inline and rail layouts at a container breakpoint.
- `ShortcutProvider` currently tries mounted registrations in order. List and detail share `s`, `p`, and `l`, but previously were not mounted together. The in-flight `tasks-plus-keyboard-shortcuts` design assumes those scopes are mutually exclusive. That assumption must be revised for this workspace, without weakening its input, overlay, composition, modifier, or outside-panel guards.
- `createDescriptionSaver` debounces description writes for 800 ms. Cleanup flush is fire-and-forget and suppresses rejected saves. It cannot prove a save succeeded before another ticket replaces the editor. `CommentComposer` holds unsent text and staged attachments locally.

## Goals / Non-Goals

**Goals:**

- Give one small workspace owner responsibility for selected identity, transition safety, and the relation between the list and detail.
- Preserve existing task operations by adapting the existing views rather than duplicating editors, controls, or queries.
- Separate durable project preference, shareable browse selection, and ephemeral focus/drafts so they do not overwrite one another.
- Keep the panel native to BB, with its existing tokens, keyboard behavior, and host-width constraints.

**Non-Goals:**

- No database or RPC changes, new dependency, cloud preference sync, automatic BB-to-Tasks project matching, or per-BB-project memory.
- No board redesign, resizable splitter, third permanent navigation column, new design system, or automatic ticket actions.
- No persistent comment-draft storage across browser reloads or panel unmount. Do not expand this into a general editor framework.

## Decisions

### 1. Restore only undirected entry; store project scope separately

Add a small versioned browse-preference module alongside the existing preference modules. Its document records a project id or an explicit All choice; absence is distinguishable from All. Keep the memory browser-profile-wide, matching the confirmed user choice.

Give an empty Tasks subpath a distinct entry representation rather than interpreting it as explicit All. Resolve that entry against the preference after the project inventory has successfully settled. Replace the undirected entry with the resolved explicit destination to avoid an extra history item. Explicit `all`, project, `active`, `manage`, and `task/<key>` destinations remain authoritative.

An explicit project or All navigation updates memory. Active, Manage, and standalone task links do not. Missing storage defaults to All; invalid or blocked storage is nonfatal and retains session usability. Do not overwrite unknown future-version documents. Confirm a missing remembered project from a successful inventory, not from initial emptiness, a stale snapshot, or an error. On inventory failure, retain memory and expose retry.

Continue using `loadViewMode` for project routes with no explicit view. A remembered board choice still opens the board. Otherwise restoration opens the list workspace with native Ticket detail.

Alternative rejected: remember the entire last route. That could reopen Manage or an unrelated task and conflate project scope with short-lived selection. Automatically choosing the linked BB project was also rejected because the user asked for the last choice, not contextual inference.

### 2. Use BB's native right pane, with one editor owner

Remove the fixed Navigation tab and keep project/folder selection, Active, Manage,
creation, presets, commands, and the sidebar accessory in the main Tasks surface.
All, Active, and project lists fill that main area. Register a flush **Ticket**
fixed tab in BB's existing right pane; keep Browser and Terminal as host tabs.
This replaces the original nested-split implementation after the user's layout
clarification. Board, Manage, standalone detail, and thread embeds stay distinct.

`BrowseWorkspace` owns the accepted selected identity, list context, transitions,
and focus intent. List receives controlled selection and reports its settled
rendered order. Detail reuses the existing editor; visible related-task links
select within the workspace and off-list links retain standalone navigation.

The host mounts page and tab as separate React trees and unmounts inactive tabs.
`ticket-panel.tsx` bridges only the tab outlet: a stable portal container keeps the
editor in the page's React tree and parks its DOM under hidden/inert markup when
Ticket is inactive. It does not create another session, route owner, or task store.
The existing TasksSessionProvider therefore survives Ticket/Browser/Terminal
switches and Ticket closure. Retention ends when the Tasks page itself unmounts.

Selection reveals Ticket when requested, before guarded writes, not again when a
slow save completes. This avoids overriding a later host-tab switch. Pending
context transitions reveal a parked origin so failures remain retryable. Declined
host opens show that same editor in a main-page recovery view without saving first.
Native placement can be retried, while leaving the origin stays guarded. Same-key refresh and resize
do not reopen Ticket. Portal scopes join the existing keyboard listener; hidden
editor overlays close instead of remaining active in document.body.

Alternative rejected: render another complete Tasks app inside Ticket. That would
duplicate route/query state, shortcut listeners, and edit ownership.

### 3. Browse routes preserve scope and optional selection

Extend All, Active, and project-list routes with an optional selected key encoded as `task=KEY` in the browse query. Project URLs retain `view=list` or `view=board`. Existing standalone `task/<key>` links keep working, including cross-project links and mentions. Board routes do not use the new list selection.

In-workspace preview changes replace the current browse history entry instead of adding an entry for every `j` press. Deliberate scope/destination changes retain normal navigation behavior. Route parsing must cover existing host-encoded subpaths and query strings, not break the existing route round-trip tests. A selected browse key is accepted only after the visible list has settled and the key is actually visible; otherwise clear the invalid selection safely. Standalone task links are exempt from that visible-row constraint.

The URL owns committed selection; the workspace temporarily owns pending transition targets. Do not maintain an independent focused-index selection. Both row highlighting and detail lookup derive from the committed key.

Keep the list mounted while switching previews and while the native Ticket tab is inactive. Reuse its existing scoped preference and scroll helpers. No selected ticket is automatically invented on first entry: show the selection prompt until a click, key, or valid browse URL selects one. A project change clears selection. A settled filter, collapse, edit, or deletion that removes the selected row requests safe clearing; transient loading does not.

Alternative rejected: keep selection only in local component state. Refreshing compact detail would lose the originating scope, and host history could not restore the same workspace. Persisting every selected ticket in local storage is unnecessary; only scope is a durable preference.

### 4. Preview navigation shares identity, while action keys follow focus

Extend the current shortcut registry with a bounded focus-owner check for list/detail registrations. Preserve one listener, one definition table, and existing global guards. A registration is eligible for its active pane; the panel and workspace navigation handlers are eligible across the workspace. Do not use registration order to decide between list and detail property actions. Update shortcut collision tests to recognize focus-exclusive list/detail action scopes rather than declaring both fully active at once.

Workspace movement uses the list's reported visible keys and current selected key. It handles `j`, `k`, Up, and Down from either pane's non-editable controls, clamps at boundaries, and on success focuses and scrolls the selected row. Real row focus remains the keyboard indicator; a separate selected fill and accessible current-item marker persist when focus moves into detail. Tab navigation continues to reach controls and does not require all focused controls to change selection.

With row focus, Enter or `o` ensures its selection and focuses a stable, non-editable detail heading/container after loading. Escape outside editing and overlays returns to the selected row; BB owns compact drawer dismissal. `s`, `p`, and `l` target the focused pane's representation of the same ticket. Detail-only actions such as comment focus and delegation remain detail actions. Existing `[` / `]` controls in split browsing must use the same visible order, not `TaskPager`'s independent unfiltered top-level query; standalone detail retains its existing pager behavior. Board keys remain unchanged. Update help from the same shortcut definitions.

Alternative rejected: make selection depend exclusively on `document.activeElement`. Moving focus to the editable preview would otherwise lose the current row and restart navigation at the first ticket.

### 5. Confirm autosaves before committing ticket replacement

Make description-save flushing awaitable with a result, keep pending draft content until confirmed success, and serialize writes per originating task so older responses cannot overwrite newer edits. Integrate pending title/property writes into the same bounded transition barrier. A request to change selected ticket, project, or in-panel destination first finishes pending autosaved edits for the current task. On success it commits the route/selection; on failure it stays on the originating task with its draft and a visible Retry action. No dialog is needed when there is nothing to save.

Coalesce rapid navigation requests while a save is running to the latest requested destination. Commit neither the row highlight nor the detail identity until the transition is allowed. For list changes caused by filters, collapse, or edits, stage the context change when necessary so a failed save can leave the originating selection visible and editable instead of clearing it underneath the user.

Keep unsent comment text, notification preference, and staged attachment ownership in a task-id-keyed session draft record at the workspace boundary. Rebind the existing composer to that record only when embedded. Selection never submits a comment, uploads a staged file as another task's comment, notifies an agent, or starts delegation. Clear a draft only through the existing successful submit/remove actions; release session drafts and file references on workspace unmount. A ticket must not inherit another ticket's component-local form state.

Guard detail data by the selected key and request generation. A slow previous response cannot become the new ticket's content. Reuse the current query cancellation/generation behavior where it already provides this protection and test it rather than adding a second query system.

Alternative rejected: rely on effect cleanup to flush. The current cleanup has no awaited result and can hide errors after the originating editor disappears. Persisting comments to the database on selection is also rejected because comments and notifications are explicit user actions.

### 6. Let BB own pane sizing and compact presentation

Keep BB's flat, token-based styling, project/filter/sort controls in the main list,
and the existing detail header/editor in Ticket. Preserve task key, status, title,
important state, wrapped metadata, and coarse-pointer targets in narrow lists.

BB owns the right-pane tab strip, resizing, and narrow-layout drawer. The plugin
has no 880px threshold, nested divider, or Back-to-list layout. The list stays
mounted, and the same editor survives native tab/drawer changes through its portal.
Each area scrolls independently. The editor's container still decides its internal
property layout; no extra property rail is introduced. Enter explicitly focuses
the non-editable visible ticket container; selection and resize never focus an editor.

Alternative rejected: an internal split or custom splitter. It puts the editor in
the wrong host area and duplicates BB's existing responsive pane behavior.

### 7. Distinguish loading, absence, and failure

The right pane represents the selected key immediately with a loading state, never leftover content for another key. Lookup errors get a Retry action; confirmed missing/deleted selections clear safely. The list remains usable during detail failures. Keep existing no-project, no-task, no-filter-match, and no-active-agent empty states on the left, with the appropriate creation or clear-filter action.

Preserve successful scoped list data during background refresh, but do not validate selection or remembered project deletion from a stale snapshot. A refreshing list that settles with the same key retains selection. A successfully settled removal requests clearing through the transition barrier.

## Risks / Trade-offs

- [Removing a fixed host tab changes panel registration and existing slot tests] -> Adapt `app.test.tsx` and `shell/shell.test.tsx`, then verify an installed BB panel does not retain an obsolete permanent Navigation pane.
- [List/detail shortcut collisions] -> Gate actions by actual pane focus and test both panes mounted, parked native-tab content, overlays, editable children, and another BB pane.
- [Fast keyboard switching races with saves or queries] -> Use awaitable per-task saves, coalesced targets, selected-key response checks, and deferred-promise tests.
- [Draft/session state leaks across tasks] -> Key records and pending operations by immutable task id, preserve explicit submit semantics, and test A-to-B-to-A with text and staged files.
- [A filter or status mutation removes the current ticket while its save fails] -> Stage the removal-producing context transition and retain the originating editor and visible row until save success or retry.
- [Existing keyboard spec still describes exclusive full-page list/detail routes] -> Document split-specific focus and Enter/Escape behavior here, keep standalone and board behavior, and reconcile the overlapping keyboard change before archiving both changes.
- [Stored project id is stale or storage is blocked] -> Validate only after a successful inventory; use safe All fallback and an in-memory current-session choice without resetting unrelated preference documents.
- [Compact list rows become unreadable] -> Preserve key/status/title and verify long titles, blocked badges, subtasks, and coarse-pointer controls against actual panel width in light and dark themes.

## Migration Plan

1. Add backward-compatible preference and browse-route handling, then adapt the list/detail workspace and host registration.
2. Leave existing task storage, CLI, RPC contracts, view/list preferences, expansion, and scroll documents intact. New browser preference data is additive and versioned.
3. Update regression tests, README navigation/shortcut guidance, and the inaccurate filter-persistence limitation.
4. Run the plugin tests, typecheck, lint, and build. Verify the installed Tasks panel in BB at split and compact widths with existing data and themes before claiming host-level acceptance.
5. Rollback is a code revert and plugin rebuild/reinstall. Existing task data and preferences remain intact; the new browse-scope key can be ignored by the earlier version.

## Open Questions

None that block implementation. Native host lifecycle, drawer behavior, and installed-theme acceptance must be checked separately from SDK fixtures.
