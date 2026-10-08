# Proposal

## Why

Tasks currently mixes projects on entry, puts project navigation in a separate right-hand pane, and replaces the list when a ticket opens. Remembering the selected project and keeping the list beside an editable ticket lets the user inspect and act on consecutive tickets without repeatedly restoring their context.

## What Changes

- Remember the last selected Tasks project, or the explicit All projects choice, across reopening and refresh on the same browser profile. Explicit project, task, Active, and Manage routes still take precedence.
- Move project selection into the list header and reclaim the right-hand navigation area for ticket detail. Keep Active, Manage, project creation, folders, and preset management reachable without a permanent third navigation column.
- Let the ticket list fill the main Tasks area and place its existing fully editable detail in a native right-hand Ticket tab. BB owns sizing, Browser/Terminal tabs, and compact drawer behavior; the plugin creates no nested split. The list and ticket scroll independently.
- Keep one selected ticket shared by the row highlight, detail pane, and keyboard navigation. Clicks, `j` / `k`, and arrow keys update the preview in the visible filtered and sorted list order, including expanded subtasks.
- Preserve list position, scoped filters, sort, expansion, and list/board preferences. Keep the editor and task-owned drafts alive while the native Ticket tab is inactive or closed, for the mounted Tasks-page session.
- Protect pending edits and task ownership during selection changes, and handle empty, loading, failed, deleted, and filtered-out selections explicitly.
- Keep the existing board, task-link, CLI, delegation, and thread-embed workflows compatible. No new backend API, database migration, or dependency is planned.

## Capabilities

### New Capabilities

- `tasks-browse-context`: Remembered project scope, explicit-route precedence, and project selection within the browsing controls.
- `tasks-split-view`: Editable list/detail composition, shared selection, keyboard and focus behavior, safe transitions, and compact-layout fallback.

### Modified Capabilities

None. `task-list-subtasks` still opens the selected subtask's detail and keeps its nesting, sorting, filtering, and count rules. `tasks-fork` retains the existing task operations and CLI contract. The in-flight `tasks-plus-keyboard-shortcuts` change is an integration dependency: this change extends its implemented list navigation to preview selection and resolves simultaneous list/detail shortcut ownership without removing its typing and overlay guards.

## Impact

- `bb-plugin-tasks-plus/app.tsx` and `shell/`: host slot registration, navigation layout, routes, topbar, preferences, shortcut dispatch, and command entry points.
- `views/list/`: compact layout, controlled selected identity, visible-order reporting, and retained scroll state.
- `views/detail/` and `views/activity/`: reuse of the existing editor, property controls, attachments, comments, and delegation, with safe task-switch handling.
- Nearby shell, list, detail, activity, persistence, keyboard, and mobile-layout tests; README keyboard and navigation guidance.
- Root design tokens and the existing BB visual identity remain unchanged. The separate design-sidecar refresh already in the working tree is not part of this feature's implementation.
