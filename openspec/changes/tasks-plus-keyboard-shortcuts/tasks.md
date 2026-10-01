# Tasks

## 1. Shortcut core

- [x] 1.1 Add `shell/shortcuts.ts` with the typed definitions table (id, keys, label, scope) for every key in the spec, and verify a unit test asserts no two entries in scopes that are active together share a key
- [x] 1.2 Add the single `window` keydown dispatcher and `useShortcuts(handlers)` hook with the guards from design decision 2 (modifiers, repeat, editable target, open overlay, focus outside panel root), and verify unit tests cover each guard plus `?` matching with Shift held
- [x] 1.3 Move the existing `Esc` back and `c` new-task listeners in `shell/app-shell.tsx` onto the hook, and verify the existing `shell/shell.test.tsx` tests for `Esc` and `c` still pass
- [x] 1.4 Add the `?` key and `ShortcutHelpDialog` built from the table, grouped by scope, and verify a test opens it with `?`, finds one entry per table row, and checks focus returns after `Esc`
- [x] 1.5 Add `v` on project routes where the board is usable, and verify tests: `v` switches list to board and stores the view; `v` on the All route does nothing

## 2. List navigation

- [x] 2.1 Mark the full-row button in `views/list/row.tsx` with `data-nav-item` and add `j`/`k`/`↓`/`↑` handlers in the list view that move DOM focus and scroll into view, and verify tests for first press, move down, move up and both list ends, including an expanded subtask row
- [x] 2.2 Add `Enter`/`o` open on the focused row, and verify a test that `o` opens the detail of the focused task
- [x] 2.3 Replace the row-level `s`/`p` `onKeyDown` with the shared handler and row menu state lifted into `ListView`, and verify the existing `views/list/row.test.tsx` menu tests still pass
- [x] 2.4 Add a labels menu to the row (reuse the detail labels picker) opened by `l`, and verify a test that `l` opens it and a label toggle saves
- [x] 2.5 Return focus to the row button when a row menu closes (`onCloseAutoFocus`), and verify a test that `s` then `Esc` leaves focus on the same row

## 3. Board navigation

- [x] 3.1 Make `TaskCard` focusable (`role="button"`, `tabIndex=0`, `aria-label`, `Enter`/`Space` open) without changing pointer drag, and verify tests for keyboard open and that the existing drag tests still pass
- [x] 3.2 Add `data-board-column` and `h`/`l`/`←`/`→` and `j`/`k`/`↓`/`↑` handlers, skipping empty columns, and verify tests for within-column moves, next-column at same index, clamp to last card, and first press
- [x] 3.3 Add `o`, `s` and `p` on the focused card (keyboard-only menus anchored in the card), and verify tests that each opens the right task or menu

## 4. Task detail

- [x] 4.1 Register `[` and `]` from `TaskPager` in `shell/topbar.tsx`, which stays mounted when hidden, and verify tests for next, previous, both ends and a narrow panel with hidden pager buttons
- [x] 4.2 Make the status, priority and labels popovers in `views/detail/rail.tsx` controlled and open them with `s`, `p` and `l`, and verify a test per key
- [x] 4.3 Add a controlled `open` to the `DispatchControl` preset dropdown and open it with `d`, and verify a test that `d` opens the menu and no `delegate` RPC call happens until a preset is picked
- [x] 4.4 Focus the comment editor on `m` in `views/activity/task-activity.tsx`, and verify a test that the comment editor has focus after `m` and that typing `c` there does not open the new-task dialog

## 5. bb palette commands

- [x] 5.1 Add `shell/command-bridge.ts` (navigator, pending intent), register the navigator from `TasksSidebarAccessory`, `TasksNavigationPanel` and `TasksAppShell` (design risk 1 fallback applied up front), and verify with tests that commands are hidden until a surface mounts
- [x] 5.2 Register the five commands in `app.tsx` with no `defaultShortcut` and `isAvailable` tied to the bridge, and make the shell consume `new-task` and `help` intents, and verify tests that each `run()` navigates to the right subPath and that the intents open the dialogs once
- [x] 5.3 Add a "Keyboard shortcuts" section to `bb-plugin-tasks-plus/README.md` that points to `?` and the palette commands, and verify the keys it names match the table

## 6. Integration check

- [ ] 6.1 Run `npm test`, `npm run typecheck` and `npm run lint` in `bb-plugin-tasks-plus`, and verify all three pass
- [ ] 6.2 In a running bb, go through list, board and detail with the keyboard only (open, change status, next task, dispatch menu, comment, help, palette commands), and verify every spec scenario works, the focus ring is visible on each step, and palette commands stay available with the bb sidebar hidden
