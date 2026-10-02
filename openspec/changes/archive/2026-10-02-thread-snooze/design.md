# Design

## Context

- `bb-plugin-pr-thread-list` has a server (`server.ts`) with one RPC (`listSummaries`), one background service (`summary-watch`), and one realtime channel (`summaries.changed`).
- The client gets PR summaries through `useSummaries` (RPC, realtime signal, reload on reconnect, 60 s poll). Tab rules are in `tabs.ts`. Groups are built in `list-model.ts`. The thread menu is built in `thread-actions.ts`.
- `PluginSidebarThread` has no snooze field. The SDK gives a plugin SQLite database (`bb.storage.database()`, `bb.storage.migrate`), cron schedules (`bb.background.schedule`, server-local time, runs only while the plugin is loaded), thread events (`thread.idle`, `thread.failed`, `thread.archived`), and `threads.markRead` / `markUnread`.
- There is no server event for "the thread now waits for an approval or an answer".

## Goals / Non-Goals

**Goals:**

- One source of truth for snoozes on the server, with a wake check that costs the same for 10 or 10,000 threads.
- Wake on time with no client open.
- The client shows a correct list at once, also before the server sweep runs.

**Non-Goals:**

- A custom snooze time, "This evening", or "In 1 hour".
- Snooze in BB's bundled thread list, or in any other plugin.
- Snooze of many threads at once.
- Changing how a snoozed child affects its parent's tab. A snoozed child that runs still puts its parent in In flight.

## Decisions

### 1. Store snoozes in the plugin's own SQLite table

```
snoozes(thread_id TEXT PRIMARY KEY, wake_at INTEGER NOT NULL, snoozed_at INTEGER NOT NULL)
index on wake_at
```

Times are epoch milliseconds. Added through `bb.storage.migrate` as statement 0.

| Option | Wake check each minute | Read for the client | Choice |
|---|---|---|---|
| Thread plugin metadata | Read metadata of every thread (N calls) | N calls | No |
| `bb.storage.kv`, one key per thread | `list` + N `get` | `list` + N `get` | No |
| `bb.storage.kv`, one key for all | One read, but every write rewrites the whole map | One read | No |
| Plugin SQLite table | `WHERE wake_at <= ?` on an index, cost grows with due rows only | One query | **Yes** |

Rows for deleted threads are removed by the sweep when `markUnread` fails.

### 2. The client calculates the wake time

`snoozePresets(now: Date)` returns Tomorrow and Next week as epoch ms, from the client's local calendar. The server compares epoch values only, so the server time zone does not matter. When both presets are equal (Sunday), it returns only Tomorrow. The server rejects a wake time in the past or more than 30 days ahead.

### 3. RPC and realtime

| Method | Input | Effect |
|---|---|---|
| `listSnoozes` | `{}` | `{ snoozes: Record<threadId, wakeAt> }` |
| `snooze` | `{ threadId, wakeAt }` | `markRead`, upsert row, publish `snoozes.changed` |
| `wake` | `{ threadId }` | delete row, publish `snoozes.changed` |

`useSnoozes` follows the `useSummaries` pattern: load on mount, reload on `snoozes.changed`, reload after a reconnect.

### 4. Wake on time: cron each minute

`bb.background.schedule("snooze-wake", "* * * * *", sweep)`. The sweep selects due rows, calls `markUnread` for each, deletes them, and publishes `snoozes.changed` once when it removed a row. The durable schedule row also runs the first sweep within a minute after a restart.

Alternative: a background service with a `setTimeout` to the next wake time. It is more exact, but it must re-arm on every write and on restart. One-minute accuracy is enough for a 9:00 wake.

### 5. Early wake: server events plus client check

- Server: on `thread.idle`, `thread.failed`, and `thread.archived`, delete the row when one exists, and publish. This covers "completes a run", "fails", and "archive ends a snooze", with no client open.
- Client: a thread counts as snoozed only when `wakeAt > now` and `needsAttention(thread)` is false. When the client sees a snoozed row that needs attention, it calls `wake`. This covers approvals, questions, unread errors, and failed queued messages, which have no server event.
- The `wakeAt > now` check moves a row at its wake time, before the sweep marks it unread.

### 6. List model

- `visibleItems` gets a `snoozedIds` set. Needs attention and In flight drop those threads before `tabFor` runs.
- In All, `scopeOf` returns `{ kind: "snoozed" }` before every other scope. Its rank is below "Threads". Group key `snoozed`, label "Snoozed". Collapse works as for other groups.

### 7. Menu and row

- `threadMenuItems` gets the snooze state and two callbacks. It adds a "Snooze" section (Tomorrow, Next week) when the thread is active, not snoozed, and does not need attention. It adds "Wake now" for a snoozed thread.
- `StateOrTime` shows `Intl.DateTimeFormat` short weekday plus `H:mm` for a snoozed row with no live state. The tooltip shows the full date and time.

## Risks / Trade-offs

- [A thread starts to wait for an answer while no client is open, and BB has no event for it] → It stays in the Snoozed group until a client opens, then it wakes at once. BB's own notifications still reach the user.
- [`thread.idle` fires when the user stops a snoozed run] → The thread wakes. This is acceptable: the user acted on the thread.
- [The plugin is disabled at the wake time] → The cron does not run. The thread wakes within a minute after the plugin loads again.
- [The user selects BB's bundled list] → Snoozed threads show as normal there. The server still marks them unread at the wake time.

## Migration Plan

- Migration statement 0 creates the table and index. No data to migrate.
- Rollback: uninstall or downgrade the plugin. The table stays in the plugin data directory and does no harm.
