# Design

## Context

See `proposal.md` for the user goal and `specs/tasks-project-switcher/spec.md` for the behavior contract. A design is needed because command delivery, modal focus, keyboard handling, and save-guarded navigation cross several existing modules.

Observed implementation:

- `shell/commands.ts` defines five palette commands. `app.tsx` registers that table. All five have no default shortcut.
- `shell/command-bridge.ts` delivers `new-task` and `help` intents to an open Tasks shell or holds one pending intent while opening it. `shell/commands.test.tsx` tests both delivery paths.
- `TasksAppShellContent` owns dialog state and already loads projects through `useProjects`. Its intent callback currently treats every non-new-task intent as help, so adding an intent requires explicit handling.
- `shell/browse-navigation.tsx` provides a folder-grouped project menu. Selecting a project requests `{ kind: "project", projectId, view: null }`.
- `useTasksNavigation` passes a route request through `TasksSessionProvider` before host navigation. `useBrowseRoute` updates remembered scope from accepted routes. This protects pending edits and keeps project view preferences separate.
- Vendored `components/ui/command.tsx` wraps `cmdk`, which is already a dependency. Vendored `Dialog` supports desktop dialogs and compact drawers.
- The Tasks shortcut provider skips editable targets, modified keys, and open overlays. Ctrl+N/P must belong to the picker, not the global Tasks shortcut table.

The package has no local `node_modules` in this checkout. The design uses the current source and SDK reference documentation; implementation must check the declared `cmdk` and SDK types after installing existing dependencies, without upgrading them for this feature.

## Goals / Non-Goals

**Goals:**

- Add one command and one plugin-owned picker, using existing inventory, dialog, and safe-navigation contracts.
- Keep query, highlighted identity, and keyboard behavior local to the picker.
- Leave pending-save and error UI visible after a selection request.

**Non-Goals:**

- Replace BB's command palette, build a general Tasks command palette, or add a direct shortcut.
- Change the header project menu, Tasks CLI, BB workspace project, database, or linked project behavior.
- Carry the source project's view mode to the destination or add a second remembered-scope store.
- Add project creation, All/Active/Manage actions, or recent-project ranking to this project-only picker. Existing navigation still supplies those actions.

## Decisions

### 1. Use the existing command-to-panel intent path

Add a `switch-project` command with title `Tasks: Switch project`, the existing availability predicate, no `defaultShortcut`, and a `switch-project` panel intent. Add explicit shell handling for all three intent types. Mount one picker controlled by shell state and reset its local state on each opening.

Use the same pending-intent path as New task when Tasks is closed. When it is already open, deliver the intent without changing the route. Prevent duplicate pickers on repeated command execution. Do not introduce a project-picker route: merely opening or cancelling a picker must not change scope or task selection.

Alternative: register a separate command for every project. This crowds the host palette, exposes dynamic project inventory at registration, and loses the agreed two-stage search experience.

### 2. Compose a focused picker from the existing primitives

Add `shell/project-switcher.tsx`. Pass the shell's project inventory, current project identity, close handler, and selection callback. Read folder metadata with the existing `useFolders` hook for supplementary paths. A folder loading failure must not prevent selecting a successfully loaded project; missing folder context can be omitted.

Compose `Dialog`, accessible title/description, `Command`, `CommandInput`, `CommandList`, and `CommandItem` rather than using the fixed `CommandDialog` wrapper. Composition allows command options and dialog focus callbacks without changing a shared component. Use host theme classes and existing responsive layout behavior.

Use project ids as item values and keys, display name and prefix, and show folder paths as secondary text. Avoid sharing the whole menu implementation with this picker: its actions and grouping differ. If the existing small folder-path calculation is needed by both controls, extract only that calculation, preserving its cycle and missing-parent checks.

Alternative: make the header dropdown searchable. That changes an existing pointer and compact-drawer workflow without being required for the command flow.

### 3. Keep one filtered result order and one keyboard owner

Use case-insensitive name/prefix matching with a deterministic source order. Disable a second automatic filtering pass if results are filtered before rendering. Keep the highlighted value as a project id, reset it to the first visible selectable result on opening and query changes, and reconcile it after inventory changes. Set navigation to stop at boundaries.

Use cmdk's native arrow and Ctrl+N/P support when the declared version supplies the required behavior. Check its types and source, and verify that behavior with component tests. If an explicit local Ctrl-key adapter is needed, place it on the picker command root only and call the same selection movement used for arrows. Do not add window listeners or weaken the existing Tasks shortcut guard. Only claim plain Ctrl+N/P, without Cmd, Alt, or Shift, and ignore composition events. Prevent browser default actions only for picker-owned navigation keys. Keep focus in the search field and use the primitive's selected-option announcement and scroll handling.

Retry is a separate button outside project results so it remains reachable with Tab and cannot become a project selection. Loading, no projects, no matches, and inventory error are explicit states. Cached rows can remain visible during refresh, but selection requires a settled, successful current project inventory. Recheck identity against that inventory when selecting.

Alternative: write a new keyboard-navigation and accessibility system. The installed command primitive already supplies most of it; a second system would create two selected-result states and more focus failure cases.

### 4. Send selections through safe Tasks navigation

A valid selection calls the shell's existing navigation with `{ kind: "project", projectId, view: null }`, then closes the picker. Do not call raw host navigation from the picker, set remembered project scope early, or copy the source route's selected ticket.

Closing the picker does not mean the switch succeeded. The existing transition waits for title, description, and property saves, retains the old draft on failure, and commits only after successful saves. Removing the modal after the request keeps retry controls reachable. The destination's saved view preference and existing narrow-panel fallback apply.

Alternative: keep the picker open until navigation completes. The current navigation contract returns no completion signal, and the modal would hide the editor's failure/retry interface. Extending the save subsystem is unnecessary for this feature.

### 5. Treat cancellation as a local modal action

After BB executes a command, its palette closes and the plugin opens its own picker. Focus the search field after that handoff settles. On cancellation, restore focus to the prior Tasks element if it is still connected and usable, otherwise to a stable labelled Tasks control or focusable shell fallback. On selection, do not restore focus to an obsolete task element after the route changes.

Planning assumption: Escape cancels the project step and returns focus to Tasks; it does not automatically reopen BB's palette. The earlier exploration mentioned going back, but no host-palette re-entry API is exposed by the inspected references. This change does not simulate host shortcuts, query private host DOM, or add a core BB API. The user can reopen the host palette with its normal shortcut.

## Risks / Trade-offs

- Host palette focus restoration can compete with picker autofocus. Mitigate with a single delivered intent, modal lifecycle focus handling, and a live keyboard handoff check.
- Native Ctrl+N/P defaults can differ by cmdk version or browser. Mitigate with focused component tests and a live check in BB; keep any correction local to this picker.
- A project inventory can change during a search. Mitigate by reconciling highlighted ids and checking the latest successful inventory before navigation.
- Switching can wait or fail while the picker is closed. Mitigate by reusing the existing transition and verifying that its originating draft and retry UI remain visible.
- The unarchived keyboard-shortcuts change expects exactly five commands in a test. Update that expectation to include this command, while preserving all five existing command behaviors.

## Migration Plan

No data migration or dependency change is needed. Build and reload the frontend plugin after implementation. Removing the new command, intent, and picker restores the existing behavior without changing project data or saved preferences.
