## Why

A thread that the user cannot act on today stays in Needs attention and adds noise. The user needs a way to put the thread away and get it back at a set time, as T3 Code does with snooze.

## What Changes

- The thread menu in **Threads with PRs** gets a Snooze section with two items: **Tomorrow** (9:00 local) and **Next week** (next Monday 9:00 local). A snoozed thread shows **Wake now** in their place.
- A snoozed thread leaves Needs attention and In flight. In All, it shows in a **Snoozed** group at the bottom, with its wake time in place of its age.
- Snooze marks the thread read. The user cannot snooze a thread that waits for an approval or an answer, or that has an unread error or a failed queued message.
- At the wake time, the plugin server ends the snooze and marks the thread unread. The thread then goes back to Needs attention.
- The thread wakes early when it needs the user, fails, or completes a run. PR status changes and child threads do not wake it.
- Snoozes are stored on the plugin server, so all clients show the same state.

## Capabilities

### New Capabilities

- `thread-snooze`: snoozing a thread until a set time, where snoozed threads show, and what wakes them.

### Modified Capabilities

- `sidebar-thread-tabs`: Needs attention and In flight no longer show snoozed threads. Each active, non-snoozed thread is in exactly one of the two tabs.

## Impact

- `bb-plugin-pr-thread-list`: server (new SQLite table, RPC methods, cron schedule, thread event handlers, realtime signal), tab rules, list model (Snoozed group), row time label, thread menu, README.
- No change to github-insight or to other plugins.
- Snoozes do not move to BB's bundled thread list. When the user selects another list, snoozed threads show as normal threads there; the server still wakes them on time.
