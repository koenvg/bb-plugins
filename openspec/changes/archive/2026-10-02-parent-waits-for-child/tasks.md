# Tasks

## 1. Tab rule

- [x] 1.1 Add a `hasActiveDescendant` argument to `tabFor` in `tabs.ts`, checked after the own in-flight rule and before the PR rules; verify new `tabs.test.ts` cases: idle parent without PR goes to In flight, unread parent stays in Needs attention, failed-checks PR loses to an active descendant
- [x] 1.2 Add an active-thread predicate (busy, background work, queued, or needs the user) and verify `tabs.test.ts` or `row-cues.test.ts` cases show unread-only and PR-only threads are not active

## 2. Descendant lookup

- [x] 2.1 In `list-model.ts`, compute the set of threads with an active descendant at any depth, ignoring archived and hidden threads and guarding cycles, and pass the flag to `tabFor`; verify `list-model.test.ts` cases: parent with running child in In flight, grandchild runs, archived child ignored, child needs the user (child in Needs attention, parent in In flight), cyclic parent references do not hang
- [x] 2.2 Verify in `app.test.tsx` that a parent is in In flight while its child runs and in Needs attention when the child is idle (two mounts: the SDK test harness cannot change threads after mount; the list recomputes on each `threads` change)

## 3. Docs

- [x] 3.1 Add the row "Has an active child thread (runs, background work, queued, or needs you)" after the "Runs, has background work" row in the README rule table; verify the table order matches the spec

## 4. Integration

- [x] 4.1 Run `npm test` and `npm run typecheck` in `bb-plugin-pr-thread-list` and verify both pass
