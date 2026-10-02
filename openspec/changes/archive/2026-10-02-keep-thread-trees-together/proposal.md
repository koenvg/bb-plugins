# Proposal

## Why

The Threads with PRs list breaks a thread tree into parts. A child that needs the user shows alone in Needs attention while its parent is in In flight. A child also leaves its tree for the Needs you group, the Pinned group, or a different project group. The user then cannot see the full tree, and cannot see which parent a child belongs to.

## What Changes

- A thread tree moves as one unit. A tree is a top thread and all its descendants that the list shows.
- Tabs: the tree is in Needs attention when its top thread needs attention, or when a lower member needs the user, has unread output, or has a PR problem. A finished child with no PR or a settled PR does not pull the tree. Else the tree is in In flight. Every member shows in the tab of its tree.
- The active descendant rule stays. It still decides the tab of each member before the tree rule.
- Needs you group (All tab): a tree goes there whole when one or more members need the user. Its rows keep their nesting.
- Pinned: the top thread decides. A pinned child stays in its tree.
- Grouping: the project, section, or machine of the top thread decides the group of the tree.
- Archived ancestor: when the list has the archived parent in its data (All tab with Archived or Both), the parent shows as a dimmed context row above its child. Otherwise the child shows as a top-level row, as today.
- **BREAKING** (behavior): the spec scenario "Parent in the other tab" now has the opposite result. The parent moves with the child.

Out of scope:
- Loading archived threads in tabs or filters that do not load them now.
- Hidden ancestors. A child of a hidden thread still shows as a top-level row.
- Sort changes. The sort order of trees uses the top thread, as today.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sidebar-thread-tabs`: the tab of a thread tree replaces the tab of each single thread, and "Tabs keep grouping, sort, and pinned order" no longer splits a child from its parent.
- `sidebar-thread-list`: new requirement that a thread tree stays together in the Needs you group, the Pinned group, and every organization mode, with archived ancestors as context rows when loaded.

## Impact

- `bb-plugin-pr-thread-list/list-model.ts`: tree building, tab filter, group scope, and a new context row flag on `ListItem`.
- `bb-plugin-pr-thread-list/tabs.ts`: unchanged rules. A new helper may combine member tabs into a tree tab.
- `bb-plugin-pr-thread-list/app.tsx`: dimmed style for context rows.
- `bb-plugin-pr-thread-list/list-model.test.ts`, `app.test.tsx`: some existing tests expect the old flat behavior and change.
- `bb-plugin-pr-thread-list/README.md`: List preferences and Triage sections.
