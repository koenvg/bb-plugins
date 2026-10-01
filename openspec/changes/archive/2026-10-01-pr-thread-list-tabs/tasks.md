# Tasks

## 1. Summary source on the server

- [x] 1.1 Find the server SDK calls for thread plugin metadata and for plugin presence (D8). Verify by a type check of a small call in `server.ts`, and record the presence call (or its absence) in design.md D8
- [x] 1.2 Add the `listSummaries` RPC contract and handler in `server.ts`: list active threads, read `github-insight` metadata with a small parallel limit, return `{ insightAvailable, summaries }`. Verify with a server test that covers a thread with a summary, a thread without one, an archived thread (left out), and a failed read (left out, no throw)

## 2. Summary parsing and badge

- [x] 2.1 Change `pr-insight.ts` to parse the full `prSummary` (state, number, URL, checks, reviewers, blockers) with the age rule of D3. Verify with tests for open older than one hour (rejected), merged older than one hour (kept), wrong version (rejected), and bad counts (rejected)
- [x] 2.2 Change `presentPullRequest` in `pr-status.ts` to take the summary only (D2). Verify that `pr-status.test.ts` covers draft, open, checks running and failed, review, changes requested, unresolved comments, conflicts, blocked, ready, merged, and closed
- [x] 2.3 Remove `experimental_useSidebarThreadPullRequest` and the per-row metadata poll from `app.tsx`. Feed `PrBadgeView` from the summaries map, loaded once and then each 60 seconds and on realtime reconnect. Verify by app tests that a badge shows for a row with a summary, shows nothing without one, and updates after the next poll
- [x] 2.4 Show the one-line notice when `insightAvailable` is false. Verify with an app test

## 3. Tab rules

- [x] 3.1 Add `tabs.ts` with `tabFor(thread, summary | null)` (D4). Verify with a table test for each scenario in `specs/sidebar-thread-tabs`, including problem-wins-over-waiting and idle without PR
- [x] 3.2 Add `tab` to `ListOptions` and `preferences.ts` with default `"attention"` (D6). Verify that a saved v1 value without `tab` loads, an invalid tab reads as the default, and reset selects Needs attention
- [x] 3.3 Filter by tab in `visibleItems` before grouping, and skip the `attention` group outside All (D5). Verify with `list-model.test.ts` cases for pinned, a child whose parent is in the other tab, archived threads left out, and project grouping inside a tab

## 4. Top bar and List options

- [x] 4.1 Turn the segmented control into the three tabs with `role="tablist"`, no counts, and arrow-key movement (D7). Verify with app tests for selection, `aria-selected`, keyboard, and an empty-tab message
- [x] 4.2 Move Active / Archived / Both into List options, shown only in All, and load only active threads in the other tabs. Verify with app tests that the choice persists and that Needs attention ignores an Archived selection
- [x] 4.3 Update `README.md`: tabs and their rules, the github-insight and `gh` requirement, the moved archived selector, and the one-minute delay. Verify that the README no longer says BB looks up PRs only for visible rows

## 5. Integration check

- [x] 5.1 Run `npm test` and the type check in `bb-plugin-pr-thread-list`, then `bb plugin build` and `bb plugin install .`. In BB, check that a thread off screen with checks running is in In flight and that its badge matches after the scroll
