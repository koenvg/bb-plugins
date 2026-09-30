# Proposal

## Why

The Tasks sidebar counts completed and canceled tasks alongside unfinished work, so its badges do not show how much work remains. The All tasks badge and each project badge should count only unfinished tasks.

## What Changes

- Exclude tasks with status `done` or `canceled` from project task-count badges.
- Make the All tasks badge show the sum of those unfinished-task counts.
- Preserve the existing top-level-task scope, including visible zero counts for projects with no unfinished top-level tasks.
- Leave task lists, navigation, the Active count, and green agent-activity indicators unchanged.

## Capabilities

### New Capabilities

- `sidebar-task-counts`: Define unfinished-task counts for the Tasks sidebar's All tasks and project badges, independent of agent activity.

### Modified Capabilities

None. The existing spec inventory does not define Tasks sidebar counts.

## Impact

- `bb-plugin-tasks-plus/api/index.ts`: Change the task-count aggregate returned by `sidebarSummary` without altering its activity aggregate.
- `bb-plugin-tasks-plus/shell/sidebar.tsx`: Retain the existing project-badge rendering and All tasks summation.
- `bb-plugin-tasks-plus/api/api.test.ts` and `bb-plugin-tasks-plus/shell/shell.test.tsx`: Cover status exclusions, totals, zero counts, and unchanged activity behavior.
- Keep the `sidebarSummary` RPC response shape unchanged. No database migration, dependency, or configuration changes are required.
