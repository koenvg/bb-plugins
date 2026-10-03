# Proposal

## Why

The Tasks board has a project menu, but users cannot search projects from BB's command palette. Add a Raycast-style handoff so users can choose a project without leaving the keyboard.

## What Changes

- Add `Tasks: Switch project` to BB's existing command palette, with no default shortcut and no direct task-board shortcut.
- Running the command opens a separate, searchable project picker in Tasks. The flow is: open BB's palette, choose the command, then search and select a Tasks project.
- Support Ctrl+N for the next result, Ctrl+P for the previous result, arrow keys, and Enter to select. These keys work while the search field has focus.
- Identify projects by name and prefix, show their folder path where needed, and mark the current project.
- Use the existing project navigation and save-before-switch behavior. Keep the current project menu and destination project view preferences.
- Show loading, empty, no-match, and failed-inventory states. Escape cancels without selecting a project.

## Capabilities

### New Capabilities

- `tasks-project-switcher`: A Tasks command in BB's palette that opens a searchable project picker with keyboard navigation and safe project switching.

### Modified Capabilities

None. Existing durable specs do not define this picker. The unarchived `tasks-plus-keyboard-shortcuts` change defines the existing five Tasks commands; this change adds one command without changing those actions or their key bindings.

## Impact

- Frontend only in `bb-plugin-tasks-plus`.
- Extend `shell/commands.ts`, `shell/command-bridge.ts`, and `shell/app-shell.tsx` for command registration and picker intent delivery.
- Add a focused picker component using the vendored command and dialog primitives and the existing project inventory.
- Reuse `useTasksNavigation` and its save barrier; do not add another route or persistence system.
- Extend command and navigation tests and document the flow in the plugin README.
- No database, server, CLI, BB project selection, or dependency changes. The picker selects Tasks tracker projects, not BB workspace projects.
