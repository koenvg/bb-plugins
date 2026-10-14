# Task records

## List project tasks

`--project` takes a tracker prefix or ID, not a BB project ID such as
`proj_...`. Resolve the tracker with `bb tasks project list`.

A list can be incomplete. Continue through JSON `nextCursor` values with
`--cursor` and the same filters and sort. A task-list mutation invalidates an
old cursor; restart the listing without it.

## Read task descriptions from files

`create` and `update` accept `--description-file` for regular UTF-8 files,
including empty files. Relative paths resolve against the invoking CLI's
working directory. `-` is a literal filename, not stdin.

The SDK host process does not read the invoking CLI's stdin. Process-local
stdin paths such as `/dev/stdin`, `/dev/fd/0`, `/proc/self/fd/0`,
`/proc/thread-self/fd/0`, and `/proc/<pid>/fd/0` are rejected before the
SDK file read and task mutation. Use a regular UTF-8 file or `--description`.

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
