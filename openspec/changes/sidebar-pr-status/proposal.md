# Proposal

## Why

BB can resolve the pull request for a thread's environment branch, but its bundled thread list does not show that status. A replaceable thread-list plugin makes PR status visible while giving this project a place for later sidebar changes.

## What Changes

- Add a separate, selectable BB sidebar thread-list plugin. It replaces the scrolling thread list, not BB's navigation, new-thread control, or footer.
- Keep the current list's essential organization and thread interactions, including pinned and nested threads, project/section grouping, archive visibility, menus, keyboard navigation, and compact-view behavior.
- Show a compact, accessible PR status on each thread row when its branch has a PR, with a link to the PR. Distinguish draft, pending or failed checks, review needs, merge readiness, merged, and closed states. Show nothing when no PR is available.
- Limit version one to PR status; future sidebar changes are outside this change.

## Capabilities

### New Capabilities

- `sidebar-thread-list`: A selectable replacement thread list that retains core navigation and shows branch PR status per thread.

### Modified Capabilities

None.

## Impact

- New standalone plugin package alongside `bb-task-board`, using the installed BB frontend SDK's exclusive `experimental_threadList` slot and opt-in `experimental_useSidebarThreadPullRequest` hook.
- No changes to BB core, the Tasks plugin, or the existing bundled thread-list plugin. Users select the replacement in Settings > Appearance > Sidebar; the built-in list remains available.
- The plugin owns list rendering and its compatibility with BB's experimental sidebar APIs. PR lookups use BB's host-managed caching and polling rather than a new GitHub integration.
