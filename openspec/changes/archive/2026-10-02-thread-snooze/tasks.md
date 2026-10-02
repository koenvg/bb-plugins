# Tasks

## 1. Snooze store on the server

- [x] 1.1 Add `snooze-store.ts` with the `snoozes` table migration (statement 0, index on `wake_at`) and functions to list, upsert, delete, and select due rows; verify with unit tests on an in-memory database
- [x] 1.2 Add `listSnoozes`, `snooze`, and `wake` to `contract.ts` with zod input and output; `snooze` rejects a wake time in the past or more than 30 days ahead; verify with contract tests
- [x] 1.3 Register the three RPC handlers in `server.ts`: `snooze` calls `markRead`, then upserts, then publishes `snoozes.changed`; `wake` deletes and publishes; verify in `server.test.ts` with a fake `bb`

## 2. Server wake triggers

- [x] 2.1 Register the `snooze-wake` cron (`* * * * *`) that marks due threads unread, deletes their rows (also when `markUnread` fails), and publishes once when it removed a row; verify with tests for due, not due, and deleted threads
- [x] 2.2 Handle `thread.idle`, `thread.failed`, and `thread.archived`: delete the row when one exists and publish; verify with tests that a thread with no row publishes nothing

## 3. Client snooze state and tab rules

- [x] 3.1 Add `snoozePresets(now)` returning Tomorrow and Next week at 9:00 local, with Next week dropped when equal; verify with tests for Wednesday, Friday, Monday 8:00, Sunday, and a DST change day
- [x] 3.2 Add `useSnoozes` (RPC load, reload on `snoozes.changed` and after reconnect) and an `effectiveSnoozes(threads, snoozes, now)` helper that drops expired entries and threads that need attention; verify the helper with unit tests
- [x] 3.3 Call `wake` from the client for a snoozed thread that needs attention, once per thread; verify in `app.test.tsx`
- [x] 3.4 Pass the snoozed set to `visibleItems`: drop snoozed threads from Needs attention and In flight, and add the Snoozed group at the bottom of All; verify in `list-model.test.ts` for plain, pinned, and collapsed cases and the no-snooze case

## 4. Menu and row

- [x] 4.1 Add the Snooze section (Tomorrow, Next week) and Wake now to `threadMenuItems`, hidden for archived threads and threads that need attention; verify the item sets in tests
- [x] 4.2 Show the wake time ("Tue 9:00", full date in the tooltip) in `StateOrTime` for a snoozed row with no live state; verify in `app.test.tsx`
- [x] 4.3 Document Snooze in `bb-plugin-pr-thread-list/README.md` (menu items, Snoozed group, wake rules, what does not wake a thread) and add the Snoozed row to the tab rules table

## 5. Integration check

- [x] 5.1 Run `npm test` and `bb plugin build` in `bb-plugin-pr-thread-list`, install locally, snooze a thread, and confirm it moves to the Snoozed group, shows its wake time, and returns to Needs attention after Wake now and after a run completes
