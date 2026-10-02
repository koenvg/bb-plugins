# Design

## Context

- `list-model.ts` `visibleItems` filters threads per thread, then puts each thread in a group (`scopeOf`), then builds trees only inside one group. A child whose parent is in another group, or was filtered out, becomes a root.
- `scopeOf` sends each `needsAttention` thread to the `attention` group, and the tree builder does not nest inside it. `belongsToPinned` already pulls the descendants of a pinned thread into Pinned, but a pinned child is a root there.
- `tabs.ts` `tabFor` gives each thread its own tab. `threadsWithActiveDescendant` feeds the active descendant rule into it.
- `app.tsx:241` loads archived threads only when the All tab selects Archived or Both. The SDK says the hook defaults to active threads. It does not say whether an Archived-only selection also returns active rows.

## Goals / Non-Goals

**Goals:**
- One place decides where a tree goes: the tab, the group, and the context rows. Members follow the tree.
- Keep `tabFor` and `threadsWithActiveDescendant` unchanged. They still give each thread its own tab.

**Non-Goals:**
- No new data load for archived ancestors.
- No change to sort rules. Roots sort by their own fields, children sort inside their parent, as today.

## Decisions

### Build trees before groups
- New order in `visibleItems`:
  1. Drop hidden threads. Index the rest by id.
  2. Find the root of each thread: walk `parentThreadId` up while the parent is in the index. Use a `seen` set to stop on a cycle, like `belongsToPinned` does.
  3. Collect trees: root id to members.
  4. Mark each member as `member` or `context`. A member passes the tab and lifecycle filter. A context row is an ancestor of a member that fails the filter.
  5. Drop trees with no members.
  6. Pick one scope per tree, then build the rows.
- Alternative: keep groups first and move children after. Rejected: every group rule (attention, pinned, mode) would need its own "follow the root" exception.

### Tree tab
- In the attention tabs, a tree's members are its active threads. The tree tab is `attention` when `pullsTreeToAttention` is true for one or more members. Else it is `inflight`.
- `pullsTreeToAttention` needs `tabFor` to give `attention`. For the top member that is enough. A lower member also needs an urgent signal: it needs the user, has unread output, or has a PR problem (failed checks, changes requested, conflicts, unresolved comments, failed queue entry).
- Why: the "no PR" and "settled PR" rules mark every finished sub-agent as Needs attention. With the plain "any member" rule, finished sub-agents pulled their running parent into Needs attention. The user saw this in BB.
- Alternative: drop the "no PR" rule for children everywhere. Rejected: a child alone at the top of its tree still needs that rule.
- A thread that is not active in an attention tab (archived) is not a member. It can be a context row only when it is loaded, and the attention tabs load active threads only. So in practice the attention tabs have no context rows.

### Tree scope
- In All: `attention` when `needsAttention` is true for one or more members. Else `pinned` when the root is pinned. Else the mode scope of the root.
- In the attention tabs: `pinned` when the root is pinned, else the mode scope of the root.
- `belongsToPinned` goes away. The root check replaces it.
- The `attention` and `isPinned` exceptions in the tree builder go away. Every group nests.

### Context rows
- `ListItem` thread rows get `context: boolean`.
- A context row renders with lower opacity in `app.tsx`. It keeps navigation and the row menu. It keeps its collapse control when it has children.
- The group `count` counts members only.
- A root that fails the filter and has no member below it is dropped (step 5).

### Collapse
- `collapsedThreads` works as today. Collapsing a root hides the whole tree.

## Risks / Trade-offs

- [One calm parent with many children pulls all of them into Needs attention when one child needs the user.] → This is the chosen model (A). The nesting shows which child needs the user.
- [A tree with an archived root, under the Active selection, shows its active children as roots.] → The root is not loaded. Spec scenario "Archived parent not loaded" fixes this result.
- [The Archived-only selection might not return active rows.] → Checked in BB (task 1.1): it does return them. Active parents of archived children show as dimmed context rows.
- [Group counts change: a group can now hold threads from other projects or sections.] → The count still matches the rows that the group shows, minus context rows.

## Migration Plan

- No stored data changes. Saved collapse ids stay valid.
- Rollback: revert the plugin version. No data to restore.
