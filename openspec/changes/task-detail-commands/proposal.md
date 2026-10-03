# Proposal

## Why

Task detail actions cannot currently be assigned personal keyboard bindings in BB. Existing single-letter shortcuts cover some actions, but BB's command palette exposes only task creation, route navigation and shortcut help, leaving due dates and the linked BB project without a dedicated command.

## What Changes

- Add ten BB commands for the open task: Change status, Set priority, Set due date, Edit labels, Change linked BB project, Dispatch task..., Write a comment, Previous task, Next task and Back.
- Register the commands without default shortcuts so users can find them in Cmd+Shift+P and bind them in Settings > Keyboard.
- Make task commands available only for the loaded, shown task detail in the Tasks panel. Do not target focused list rows, board cards, embedded task cards or a previously opened task.
- Reuse existing property menus, dispatch behavior, comment editor and pager. Opening a property or dispatch command does not save anything or start an agent; choosing a dispatch preset retains the existing delegation behavior and safeguards.
- Make due date and linked-BB-project controls openable from commands in both wide and narrow task layouts. Explain in the linked-project picker that its setting affects all tasks in the tracker project, not only the open task.
- Preserve existing single-letter shortcuts and the five existing palette commands.

Out of scope: new default key bindings, list/board commands, commands for embedded task views, task search, title/description editing commands, changes to delegation policy, a new task-start composer, server changes and data migrations.

## Capabilities

### New Capabilities

- `task-detail-commands`: task-scoped BB palette commands and user-bindable actions, including safe targeting, keyboard-ready controls and navigation.

### Modified Capabilities

None. `tasks-fork` keeps its existing workflows. `task-thread-start` describes a separate task-start composer and is not changed by these commands. This change builds on the implemented code in the pending `tasks-plus-keyboard-shortcuts` change without rewriting that change's artifacts or adding list/board behavior.

## Impact

- `bb-plugin-tasks-plus/shell/commands.ts` and `app.tsx`: additional command registrations using the existing SDK API.
- A task-detail command bridge and panel-local registration hook under `shell/`, alongside the existing navigator/panel-intent bridge.
- `shell/app-shell.tsx`, `shell/topbar.tsx` and `views/detail/index.tsx`: current-task ownership, shared action handlers, availability and lifecycle cleanup.
- `views/detail/rail.tsx`: controlled due-date and linked-project menus, keyboard focus, and linked-project control in the inline layout.
- Existing dispatch and activity controls remain the execution paths; their keyboard focus and busy-state behavior receive command-specific coverage.
- `shell/commands.test.tsx`, `views/detail/keyboard.test.tsx`, `views/detail/rail.test.tsx`, README and the bundled Tasks skill document and verify the workflow.
- No new dependency, SDK API, CLI command, RPC endpoint or persisted field is required. The package already declares SDK 0.5.9, which supports commands and user keyboard bindings.
