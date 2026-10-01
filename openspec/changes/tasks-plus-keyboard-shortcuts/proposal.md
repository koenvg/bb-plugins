# Proposal

## Why

Tasks-plus needs the mouse for almost all work. Today only `c` (new task), `Esc` (back from a task) and `s`/`p` on a focused list row work from the keyboard. You cannot move through the list or board with keys, you cannot reach board cards at all, and no screen shows which keys exist. OpenForge shows that one shortcut table with list navigation and a `?` help dialog makes a task tool fast to use from the keyboard.

## What Changes

- Add one shortcut table in tasks-plus. The key handler, the `?` help dialog and the bb palette commands all read from it.
- Add panel-wide keys: `c` new task (existing), `?` shortcut help, `v` toggle list/board on a project.
- Add list navigation: `j`/`k` and `↓`/`↑` move focus between rows, `Enter`/`o` open, `s`/`p`/`l` open the status, priority and labels menus.
- Add board navigation: `h`/`l` and `←`/`→` move between columns, `j`/`k` and `↓`/`↑` move within a column, `Enter`/`o` open, `s`/`p` open the status and priority menus.
- Make board cards focusable buttons so the keyboard can reach them.
- Add task detail keys: `Esc` back (existing), `[`/`]` previous/next task, `s`/`p`/`l` open the property menus, `d` opens the Dispatch preset menu, `m` focuses the comment box.
- Register bb palette commands with no default keys: New task, Go to All, Go to Active, Go to Manage, Show keyboard shortcuts. The user can bind keys to them in bb.
- Plain-key shortcuts do not fire while focus is in a text field, editor or open menu or dialog.

Not in scope:
- Key sequences (for example `g` then `a`).
- Keyboard drag on the board, ARIA rework of list and board, lightbox focus trap, keyboard path to the context menu.
- User rebinding of in-panel keys.

## Capabilities

### New Capabilities
- `tasks-keyboard-shortcuts`: keyboard shortcuts, list and board keyboard navigation, the shortcut help dialog and bb palette commands for the tasks-plus panel.

### Modified Capabilities

None.

## Impact

- `bb-plugin-tasks-plus/app.tsx`: register palette commands with `app.commands.register`.
- `bb-plugin-tasks-plus/shell/app-shell.tsx`: replace the two ad-hoc `window` keydown listeners with the shared handler.
- New shortcut module in `bb-plugin-tasks-plus/shell/` (table, handler, help dialog, palette bridge).
- `views/list/row.tsx`, `views/list/index.tsx`: row navigation, `l` key.
- `views/board/index.tsx`: focusable cards, column navigation.
- `shell/topbar.tsx`: pager logic reused by `[`/`]`.
- `views/detail/rail.tsx`, `views/detail/threads.tsx`, `views/activity/task-activity.tsx`: open menus and focus the comment box from keys.
- No new dependencies. No server or data changes.
