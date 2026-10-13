# Task records

## List project tasks

`--project` takes a tracker prefix or ID, not a BB project ID such as
`proj_...`. Resolve the tracker with `bb tasks project list`.

A list can be incomplete. Continue through JSON `nextCursor` values with
`--cursor` and the same filters and sort. A task-list mutation invalidates an
old cursor; restart the listing without it.

## Change hierarchy or dependencies

Changing a parent does not add a dependency. A dependency cycle is rejected
without saving.

The last blocker becoming `done` or `canceled` clears the dependency gate, not task completion. Read current blocker state and badges; this causes no notification.

## Repair thread links

Inspect `bb tasks threads ABC-12` before changing links. Attach the thread
actually doing the work. Keep task-to-thread links when work completes, enters
review, is handed off, is replaced, fails, or moves to other work. Detach only
when the user explicitly requests removal of that task-to-thread link, with
`bb tasks detach ABC-12 --thread <thread-id>`.

Detaching does not stop the thread or change the task status. Retained links
grant no new ownership or reporting authority. Attaching a thread does not
start its execution.
