# Tasks

## 1. Check the data

- [x] 1.1 In BB, select All with Archived and check whether `experimental_useSidebarThreads` also returns active rows, and record the result in design.md under the Archived-only risk

## 2. Trees before groups in `list-model.ts`

- [x] 2.1 Find the root of each non-hidden thread (walk `parentThreadId` through loaded rows, stop on a cycle), and verify with a `list-model.test.ts` test for a 3-level tree, a hidden parent, and a cyclic pair
- [x] 2.2 Mark tree members (pass the tab and lifecycle filter) and context ancestors, drop trees with no members, and verify with tests for an archived child under an active parent and for an archived root with no active member
- [x] 2.3 Compute the tree tab (Needs attention when the top member is in Needs attention, or a lower member is there for an urgent reason: needs the user, unread, or a PR problem; else In flight), and verify the "Thread tree decides the tab" scenarios with tests, including "Tree moves when the last attention member clears"
- [x] 2.4 Pick one scope per tree (All: Needs you, then pinned root, then root mode scope; attention tabs: pinned root, then root mode scope), remove `belongsToPinned` and the flat-row exceptions, and verify with tests for a pinned child, a pinned root with children, a child in another project, and a child in another section
- [x] 2.5 Add `context: boolean` to thread `ListItem`s, count only members in the group `count`, and verify with a test that a context row is not counted
- [x] 2.6 Update the existing tests that expect flat rows ("lifts threads that need the user", "flattens a child whose parent is in the other tab", the pinned child test), and verify `npm test` passes in `bb-plugin-pr-thread-list`

## 3. Context rows in `app.tsx`

- [x] 3.1 Render a context row with lower opacity and keep navigation, the row menu, and the collapse control, and verify with an `app.test.tsx` test that a context row opens its thread and has the dimmed style

## 4. Docs

- [x] 4.1 Update the List preferences and Triage sections of `bb-plugin-pr-thread-list/README.md` (trees move as one unit, top thread decides group and pin, archived ancestors as dimmed rows when loaded), and verify the README no longer says a child shows as a top-level row when its parent is in the other tab

## 5. Integration

- [x] 5.1 Run `npm test` and the typecheck in `bb-plugin-pr-thread-list`, and verify both pass
- [x] 5.2 Build and install the plugin, and verify in BB that a child that waits for an approval shows under its running parent in Needs attention
- [x] 5.3 Run `openspec validate keep-thread-trees-together --strict`, and verify it passes
