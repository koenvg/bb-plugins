# Design

## Context

See proposal.md for motivation and specs/task-detail-commands/spec.md for the behavior contract. This design is required because command registration, route lifecycle, task readiness, pager state and property controls span several modules.

Observed in this checkout:

- `app.tsx` registers `TASKS_COMMANDS`. `shell/commands.ts` contains five global Tasks commands with no default bindings.
- `shell/command-bridge.ts` bridges static SDK callbacks to mounted navigators and queues only New task or Help intents. Its navigator availability does not identify an open task.
- The SDK's command callbacks receive thread/project context, not a task key or Tasks route. `isAvailable` is synchronous and is checked for listing and keyboard invocation. Commands appear in Settings > Keyboard even without defaults. Package SDK 0.5.9 already supports these contracts.
- `ShortcutProvider` and `useShortcuts` register live handler maps. Shell, pager and task detail own different actions. The single-key guards deliberately ignore typing and open overlays.
- `TaskDetail` owns controlled status, priority, labels and dispatch menu state and uses `shownPropertiesLayout` to select the rendered layout. Inline properties and the rail both remain mounted; CSS hides one.
- `DueDateMenu` and `DispatchTargetMenu` own local open state. The linked-project control exists only in the rail and calls `updateProject` with `linkedBbProjectId`.
- `DispatchControl` owns its busy state and disables its menu when dispatching or no current preset exists. Selecting a preset invokes the existing delegation path. The parent currently checks only whether presets exist for the `d` shortcut.
- `TaskPager` owns the sibling query and ordering, even when CSS hides its buttons. The shell owns Back and its All fallback. Task detail owns the Tiptap comment-editor ref.
- Existing SDK-rendered tests in `shell/commands.test.tsx`, `views/detail/keyboard.test.tsx` and `views/detail/rail.test.tsx` cover the nearby contracts. No code or configuration changes are part of this planning change.

## Goals / Non-Goals

**Goals:**

- Put targeting, lifecycle cleanup and execution checks behind one small task-detail command module interface.
- Let the action owners supply their existing handlers so palette actions, assigned bindings and single-letter shortcuts cannot acquire different business behavior.
- Keep command IDs stable and make availability reflect the shown task and the actual control readiness.

**Non-Goals:**

- Turning the shortcut dispatcher into a generic command framework or changing the existing panel-intent queue.
- Using DOM clicks, synthetic keyboard events or task lookup RPCs to execute commands.
- Inferring a task from a BB thread/project, persisting a selected task, or adding SDK capabilities.
- Broad accessibility or layout changes unrelated to these ten actions.

## Decisions

### 1. Register a separate table of task-detail command definitions

Add a typed table alongside the existing command definitions and append its registrations through the existing `TASKS_COMMANDS` loop. Use these stable IDs and titles:

| ID | Title |
| --- | --- |
| `task-change-status` | Tasks: Change status |
| `task-set-priority` | Tasks: Set priority |
| `task-set-due-date` | Tasks: Set due date |
| `task-edit-labels` | Tasks: Edit labels |
| `task-change-linked-bb-project` | Tasks: Change linked BB project |
| `task-dispatch` | Tasks: Dispatch task... |
| `task-write-comment` | Tasks: Write a comment |
| `task-previous` | Tasks: Previous task |
| `task-next` | Tasks: Next task |
| `task-back` | Tasks: Back |

No registration supplies `defaultShortcut`. Existing global command IDs are unchanged. The task-detail definitions map to semantic actions, not to keyboard events. Do not add bare-key shortcuts for due date or linked project in this change.

Alternative: expose every entry in `SHORTCUTS` automatically. Rejected because list/board keys are out of scope, two requested actions have no bare key, and command availability is different from key-event filtering.

### 2. Use a task-detail command module, not pending panel intents

Place the command seam under `shell/`. Its interface provides typed action registration for React owners, synchronous availability lookup and guarded execution for static SDK callbacks. Internally it owns live handler refs, a task-route session identity, task-loaded readiness, the Tasks panel root and cleanup.

The Tasks shell establishes a panel-local session for the current task route. `TaskDetail` marks that session ready only while its loaded task matches the route. The pager and shell register navigation handlers in the same session. Outside this provider, registration does nothing, so reusing `DetailView` in an embedded view cannot accidentally become a global command target.

Availability requires one eligible shown task session, loaded task identity matching the current route, and a non-null handler for the requested action. Check panel-root visibility as well as route state; a mounted but hidden task panel is not eligible. Use a panel root with real layout rects, not the current `display: contents` shortcut wrapper, and check rendered geometry plus CSS/HTML hidden state rather than whether a navigator exists. Do not treat the palette's temporary background `inert` or `aria-hidden` state as leaving the Tasks panel. If more than one eligible session exists, fail closed instead of picking an arbitrary task.

`run` repeats resolution at execution time, using the current session rather than the task seen when the palette was listed. Changing task keys invalidates registrations for the old key. Route changes, loading/error states, unmounts and plugin reload remove eligibility and old handlers. Task-specific actions are never stored in the global pending-intent queue and never navigate back to a previously opened task.

Alternative: extend `PanelIntent` and reuse navigator availability. Rejected because those global intents intentionally open a panel from elsewhere, which violates the agreed open-task-only behavior.

### 3. Register actions where their state lives

Keep the existing action ownership:

- Shell: Back using `backFromTask`.
- `TaskPager`: Previous and Next using the existing computed keys; missing destinations register as unavailable. Do not introduce a second pager query or alter its current ordering/filter semantics.
- `TaskDetail`: property menu openers and comment focus. Reuse the same callbacks in `useShortcuts` and task-command registration. The comment handler is available only when its editor is ready.
- `DispatchControl`: expose actual menu readiness, including busy state, to the detail owner through a small readiness callback. Track the shown layout's readiness so the hidden duplicate control cannot make a busy visible control appear available. Both the command availability and invocation opener check this readiness.

Keep registration/lifecycle mechanics inside the command module, not repeated across these callers. Do not move delegation or property persistence into the bridge.

Alternative: centralize all handlers in `app-shell.tsx`. Rejected because it would require moving or duplicating detail/editor/dispatch state and the pager query solely for palette access.

### 4. Make the missing pickers controlled and available in both layouts

Extend the detail menu selection with due date and linked BB project. Convert `DueDateMenu` and `DispatchTargetMenu` to the same controlled-open interface as the other property controls, while retaining their local draft/save state and persistence behavior.

Pass the task's loaded tracker project into `InlineProperties` and render a compact linked-project trigger there. Share the picker implementation between inline and rail layouts and avoid separate copies of its BB-project query. All task property commands use the existing visible-layout selection rather than opening both mounted copies.

The linked-project picker identifies `project.name` and states that the link applies to all tasks in that tracker project. Changing this link still calls `updateProject`; it is not a task-move operation. Opening the picker initializes the selection from the current project, and Escape abandons that unsaved selection. Saving, explicit unlinking and existing error messages retain their current behavior.

Alternative: open the hidden rail picker on narrow screens. Rejected because its anchor is invisible and focus restoration would land on a hidden control.

### 5. Treat palette focus handoff separately from bare-key guards

Do not call `shouldIgnoreKey` for palette availability or command execution. It rejects all dialogs and editable focus, so reusing it would hide commands while the palette itself is open and block intentional assigned shortcuts from an editor.

Use the existing Radix controls for focus placement and Escape dismissal, but verify actual palette-close ordering. If BB invokes `run` before restoring palette focus, defer only the UI activation until that handoff completes. Any deferred activation must recheck the task session and action availability, and be cancelled when the target changes or unmounts. It must not create a persistent pending task intent.

For popovers, set initial focus to the relevant interactive control and restore it to the visible trigger on close. For comments, focus the existing editor at the end of its draft after palette closure. Commands open controls only; saving a property, selecting a dispatch preset and submitting a comment remain the existing user actions.

Alternative: synthesize `s`, `p`, `d` or `m`. Rejected because the palette's dialog/focus triggers the bare-key guards, and the dispatcher's scope is wider than the task-command contract.

### 6. Verify through command execution and rendered controls

Test static command registration and execution through the exported command registrations and SDK-rendered Tasks panel. Add small command-module lifecycle tests only where needed for hidden session and ambiguous session cases, rather than testing private registry storage.

Extend existing tests for actual property selection, dispatch cancellation/selection/busy state, comment draft focus, pager ends, Back, and both layouts. Simulate visibility in jsdom explicitly because it does not calculate layout. Run a live BB keyboard-only check for palette focus restoration, personal bindings, hidden retained panels and the narrow layout; direct `run()` tests cannot prove host palette timing.

## Risks / Trade-offs

- Mounted task views can outlive their shown route. Mitigate with route identity, loaded readiness, panel visibility checks and execution-time resolution, not registration presence alone.
- The SDK callback has no current-task or panel-visibility field. Use the shell's own route and visible root, test hidden mounted panels, and verify the host behavior live. Do not use undocumented BB DOM selectors to guess navigation state.
- The host palette can steal focus after an action opens. Cover its closing handoff live and cancel deferred UI actions on task changes.
- Inline and rail controls both stay mounted. Use one selected-layout menu state, explicit focus checks and shown-layout dispatch readiness to avoid duplicate menus or busy-state drift.
- The linked-project command edits a shared tracker-project setting. Name the tracker project and shared scope inside the picker before saving.
- Navigation commands retain the pager's current scope, which may differ from a filtered list. Reuse that behavior instead of expanding this change into pager redesign.
- The pending keyboard-shortcuts change has unchecked integration tasks. This change relies on its current implemented code and repeats the affected regressions rather than treating those tasks as verified.

## Migration Plan

This is a frontend-only additive change with no data migration. Build and reload the plugin after tests, typecheck and lint pass. Confirm the ten commands appear in Settings > Keyboard and the applicable palette rows appear only on an open task. Assign a temporary free binding for verification, then remove it.

Rollback reverts the frontend and documentation changes. Existing task data, project links and delegated threads remain unchanged. Stable command IDs must be retained in future releases so personal bindings continue to work.
