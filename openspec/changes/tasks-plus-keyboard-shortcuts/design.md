# Design

## Context

- Plugins render in bb's own DOM (no iframe). A `window` keydown listener sees all key presses in bb, including those meant for other panes.
- `shell/app-shell.tsx` has two separate `window` listeners (`Esc` back, `c` new task) with guards `isEditableTarget` and `hasOpenOverlay` (a DOM query for `role=dialog|menu|listbox`).
- List rows: each row has a full-row `<button>` (`views/list/row.tsx`) with its own `s`/`p` `onKeyDown`. Menus open through `setOpenMenu` state in the row.
- Board cards (`views/board/index.tsx` `TaskCard`) are `<div onClick onPointerDown>` with no tabindex.
- The pager (`shell/topbar.tsx` `TaskPager`) computes prev/next inside the component and is hidden below the `@sm` container width.
- SDK: `app.commands.register({ id, title, defaultShortcut?, isAvailable?, run })`. `run(ctx)` gets only `threadId`, `projectId`, `openPanel`. Navigation to a nav panel exists only as the hook `useBbNavigate().toPluginPanel`.
- OpenForge reference: one definitions table feeds registry, help and palette. Its weak points are help text that drifts from the table and silent overwrite on duplicate keys.

## Goals / Non-Goals

**Goals:**

- One definitions table is the only place where a key and its label live.
- One keydown entry point with one set of guards.
- List and board navigation use real DOM focus.

**Non-Goals:**

- A general-purpose shortcut library or scope stack.
- Shortcuts in the thread-side `TaskEmbedPanel` or `TaskDirectiveCard`.

## Decisions

### 1. Definitions table plus handlers keyed by id

```
shortcuts.ts (table: id, keys[], label, scope)
      |                     |
      v                     v
 useShortcuts({ id: handler | null })   ShortcutHelpDialog
 (each owner registers what it owns)    (groups by scope)
```

- `shell/shortcuts.ts` exports a typed table. Each entry: `id`, `keys` (for example `["j", "ArrowDown"]`), `label`, `scope` (`panel | list | board | detail`), optional `repeatable`.
- `useShortcuts(handlers)` takes a partial map from `id` to handler. The component that owns the state registers the handler: the shell owns `c`, `?`, `v`, `Esc`; `TaskPager` owns `[` `]`; `TaskDetail` owns the property keys. A `null` handler means "not available here".
- A handler returns `false` when it did not act (for example `Enter` with no focused row). The event then keeps its default action.
- A test asserts that no two entries in scopes active at the same time share a key. This fixes OpenForge's silent overwrite.
- Alternative: one exhaustive handler map per scope. Rejected during build: the detail scope's state lives in three components, so one map per scope forced prop drilling.

### 2. One window listener with shared guards

- A single `window` keydown listener (capture off) in the shell dispatches to the handlers that the mounted views registered.
- Guards, in order:
  1. `event.defaultPrevented`, `event.repeat`, or Cmd/Ctrl/Alt held: ignore.
  2. Target is input, textarea, select or contentEditable: ignore.
  3. Open overlay (existing `hasOpenOverlay`): ignore.
  4. Focus is outside the panel root and not `document.body`: ignore.
- Shift is not a guard. Match on `event.key`, so `?` matches Shift+`/`. A single letter typed without Shift is lowercased first, so Caps Lock does not break `s` or `p`.
- The existing `Esc` and `c` listeners move into this table. The row-level `s`/`p` `onKeyDown` in `row.tsx` is removed; the list handler reads the focused row from `document.activeElement`.
- Editable detection also checks `closest("[contenteditable]")`, because a key can target a child node of the editor.
- Alternative: keep per-element `onKeyDown`. Rejected because `j`/`k` must work when no row has focus, and because it splits the key list across files.

### 3. Roving DOM focus, not a virtual index

- `j`/`k` find `[data-task-key]` focus targets in the view container in DOM order and call `.focus()` on the next one, then `scrollIntoView({ block: "nearest" })`.
- The full-row button gets a `data-nav-item` attribute so the query skips the expand button and menu triggers.
- Alternative: OpenForge's `focusedIndex` state with `aria-current`. Rejected: it needs extra state and a fake highlight, and screen readers do not follow it. DOM focus gives the existing `focus-visible` ring for free.

### 4. Board: focusable cards and grid lookup

- `TaskCard` gets `role="button"`, `tabIndex={0}`, `aria-label="Open KEY: title"` and an `onKeyDown` for `Enter`/`Space`. Pointer drag stays unchanged.
- Each column root gets `data-board-column`. `h`/`l` find the current column, step to the next column that has cards, and focus the card at the same index or the last card.

### 5. Menus opened from keys

- List: `ListView` holds `{ taskKey, menu }` for the one open row menu and passes `openMenu` / `onOpenMenuChange` to each row. Alternative: a custom DOM event per row. Rejected: lifted state is explicit and only one menu can be open.
- The row gets a labels popover anchored to the title. The picker is shared with the detail rail (`views/labels-picker.tsx`).
- Board: cards had no menus. `s`/`p` render the list status/priority menu with a hidden zero-size anchor inside the focused card. No new visible controls. Card click and pointer handlers ignore events whose DOM target is outside the card, so clicks in the portaled menu do not open or drag the card.
- Board status changes reuse the drag path (`boardMove`, optimistic). Priority uses `updateTask` and a refresh.
- Detail: status, priority, labels and the Dispatch preset menu are controlled. Both property layouts (inline and rail) stay mounted and CSS hides one, so the key handler opens the menu in the layout that has client rects.
- Radix returns focus to the menu trigger. Row and card menus override `onCloseAutoFocus` to focus the row or card. The help dialog has no trigger, so it saves the focused element when it opens and focuses it on close.

### 6. Pager keys live in `TaskPager`

- `TaskPager` already owns the sibling query and stays mounted when CSS hides it in a narrow panel. It registers `[` and `]`. Alternative: extract a `useTaskPager` hook for the detail view. Rejected: a second copy of the query with no shared cache.

### 7. Palette commands through a module-level bridge

```
app.commands.register(run) --> tasksCommandBridge.navigate(...)
                                   ^
TasksSidebarAccessory --------------+ sets navigate from useBbNavigate()
TasksAppShell ------> reads tasksCommandBridge.pendingIntent on mount/change
```

- `shell/command-bridge.ts` holds the registered navigators, one intent listener and a `pendingIntent` (`"new-task" | "help" | null`).
- `TasksSidebarAccessory`, `TasksNavigationPanel` and `TasksAppShell` each register `useBbNavigate()`. The latest one wins.
- `run()` sets the intent if needed and calls `toPluginPanel("tasks", { subPath })`. The shell subscribes and consumes the intent.
- `isAvailable()` returns false while no navigator is registered.
- Alternative: encode the intent in the subPath (for example `new`). Rejected: it adds routes that stay in browser history and reopen the dialog on back.

### 8. Help dialog

- `ShortcutHelpDialog` uses the existing `components/ui/dialog` (Radix: focus trap, `Esc`, focus return). It renders the table grouped by scope with `<kbd>` elements.

## Risks / Trade-offs

- [No tasks surface is mounted (sidebar hidden, panel closed)] → `isAvailable` hides the commands. Registration from three surfaces makes this rare. Task 6.2 checks it in a running bb.
- [An intent is sent while the panel is mounted but not visible] → The dialog opens out of sight. Accepted until bb exposes panel visibility.
- [Single letters clash with bb host shortcuts that use bare keys] → Host bindings in the SDK schema use modifiers. The focus-inside-panel guard limits impact.
- [`hasOpenOverlay` matches any dialog in bb, not only ours] → Accepted. It errs on the side of not firing.
- [Moving `s`/`p` from the row `onKeyDown` to the shared handler changes event order] → Existing tests in `views/list/row.test.tsx` and `shell/shell.test.tsx` must still pass unchanged in behavior.
- [Custom DOM events are an implicit contract] → Keep the event name and detail type in `shortcuts.ts` next to the table.

## Migration Plan

UI-only. No data or server change. Rollback is a revert.

## Open Questions

- Exact visual style of the `<kbd>` hints. This does not change behavior.
