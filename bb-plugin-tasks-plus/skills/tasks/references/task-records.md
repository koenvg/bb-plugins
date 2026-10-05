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

The last blocker becoming `done` or `canceled` adds an "Unblocked" system
comment. This means the dependency gate cleared, not that the task is complete.

## Notify the latest responder

Use `comment --notify` only when the intended recipient is the thread that
wrote the task's latest agent reply. That recipient is not necessarily the
parent agent or coordinator. An idle recipient resumes; with no prior agent
reply, the comment is stored without delivery to an unrelated thread.

In agent context, an explicit `--author` changes the display name, not the
current thread identity. Delivery targets the prior latest responder, not the
new comment's author. Reporting guidance does not authorize notification.

## Repair thread links

Inspect `bb tasks threads ABC-12` before changing links. Attach the thread
actually doing the work. Keep task-to-thread links when work completes, enters
review, is handed off, is replaced, fails, or moves to other work. Detach only
when the user explicitly requests removal of that task-to-thread link, with
`bb tasks detach ABC-12 --thread <thread-id>`.

Detaching does not stop the thread or change the task status. Retained links
grant no new ownership or reporting authority. Attaching a thread does not
start its execution.
