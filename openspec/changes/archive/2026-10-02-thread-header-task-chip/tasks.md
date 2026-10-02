## 1. Tasks for a thread (server)

- [x] 1.1 Add a store test in `bb-plugin-tasks-plus/db.test.ts`: link ABC-15 and then ABC-12 to one thread (ABC-15 first), and link another task to a second thread. Assert that the new store query returns ABC-15 first, then ABC-12, and does not return the other thread's task. Verify it fails first.
- [x] 1.2 Add the store query in `db/store.ts`. It joins `task_threads` to `tasks` by `thread_id` and sorts by `attached_at`, then `id`. Do not change `listTaskThreadsByThreadId`. Verify 1.1 passes.
- [x] 1.3 Add `getTasksForThread` (`{ threadId }` to `{ tasks: Task[] }`) to `shared/contract.ts` and `api/index.ts`. Add an `api/api.test.ts` case for a linked thread and an unlinked thread (empty list). Verify it passes.

## 2. Header chip (app)

- [x] 2.1 Add `views/thread-header/thread-header.test.tsx` cases for `app.threadHeaderActions[0]`. With one linked task in `in_review`, assert the icon, key and "In Review". With two linked tasks, assert the first key and "+1". With no linked task, assert that nothing renders. Verify they fail first.
- [x] 2.2 Add the chip component in `bb-plugin-tasks-plus/views/` and register it in `app.tsx` with `app.slots.experimental_threadHeaderAction`. Reuse `StatusIcon` and `STATUS_LABELS`. Render nothing while loading, on error, or when the list is empty. Verify 2.1 passes.
- [x] 2.3 Add a test that a click calls `openThreadPanel` with `{ actionId: "task", params: { taskKey } }` for the first task, and that no write RPC is called. Implement it. Verify it passes.
- [x] 2.4 Add tests that `tasks:changed` updates the status label, and that `threads:changed` shows the chip on a thread that had none. Use a request counter so a late response does not win. Verify they pass.
- [x] 2.5 Add a test with `isCompactViewport: true`: the icon and key show, the label text is hidden, and the accessible name includes the status label. Implement it. Verify it passes.

## 3. Verify

- [x] 3.1 Run `npm run typecheck`, `npm run lint`, and `npm test` in `bb-plugin-tasks-plus`. Verify all pass.
- [x] 3.2 Open a task-linked thread in the running app with `/run`. Verify that the chip fits the 48px row, does not push other controls out of place, and opens the task panel. Take a screenshot.
