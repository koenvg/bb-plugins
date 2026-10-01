# Tasks

## 1. Plugin package and slot

- [x] 1.1 Scaffold `bb-plugin-pr-thread-list`, remove generated demo features, keep the required minimal server entry and frontend manifest, and verify `bb plugin types` and `bb plugin build` succeed.
- [x] 1.2 Register the exclusive thread-list slot and add a mounting test with `renderSlot` that verifies a seeded thread is rendered; verify the bundled plugin remains installed and selectable.

## 2. Organization, visibility, and preferences

- [x] 2.1 Implement pure visible-tree derivation for project, machine, and section modes, pinned and nested threads, sorting, hidden rows, and collapse state; verify fixture tests cover each mode, pinned deduplication, and collapsed descendants.
- [x] 2.2 Add versioned per-client preferences and visible controls for lifecycle, grouping, sorting, and collapse; verify tests preserve choices after remount, including non-default values and a malformed stored value, and document the first-selection default and reset behavior in the plugin README.
- [x] 2.3 Wire active and archived lifecycle selection to the SDK's paginated archive query and a Show more control; verify tests cover the empty, loading, error, next-page, and exhausted-page states.
- [x] 2.4 Flatten and window visible items with overscan; verify a large-list test mounts only a bounded number of rows and collapsed or offscreen rows do not mount PR hook consumers.

## 3. Thread rows and actions

- [x] 3.1 Render selected, unread, activity, queued-work, draft, row-status, and shortcut cues with host labels; verify tests cover busy, needs-attention, draft, unknown-status fallback, and active-row cases.
- [x] 3.2 Implement thread and group context actions with host action hooks and public SDK operations, including pinned reorder, section changes, archive/unarchive, and BB-confirmed delete; verify interaction tests assert the intended thread IDs and confirmation path.
- [x] 3.3 Implement row anchors, shortcut target attributes, split drag affordances, and compact-viewport navigation; verify tests for normal click, keyboard targeting, split support, and drawer close after navigation.

## 4. Pull request badge

- [x] 4.1 Map every reported PR attention/state value to concise text, accessible name, and visual tone without overwriting thread execution status; verify unit tests for draft, open, checks, reviews, conflicts, blocked, ready, merged, closed, and unknown values.
- [x] 4.2 Mount the opt-in PR hook only in visible row badge components and render a sibling PR link beside the thread anchor; verify slot tests with seeded PRs show the number/status and opening the link does not open the thread.
- [x] 4.3 Handle pending and null PR results without a badge and reflect host-supplied status updates for shared-environment threads; verify tests cover no PR, unavailable lookup, updates, and two threads using one environment, and document PR labels and host-managed lookup limits in the README.

## 5. Integration and rollout

- [x] 5.1 Run plugin tests, typecheck, and `bb plugin build`, and verify all commands pass with the installed SDK version.
- [x] 5.2 Install locally and select the replacement on a test client; verify existing sidebar navigation, menus, organization modes, archive paging, compact layout, and a no-PR thread, then check a PR-bearing environment if one is available without creating or changing a PR. Record any unavailable live PR check.
- [x] 5.3 Switch the client back to the bundled list and verify rollback needs no data change; check a large thread list remains usable and record any parity gaps before daily use.
