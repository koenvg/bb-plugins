---
name: tasks
description: "Work on BB Tasks such as ABC-12, manage task records, or dispatch task workers."
---

# Tasks

Use `bb tasks <command> --help` for syntax, accepted values, and limits. Prefer
stable task keys. Use `--json` when output drives another action.

Before dispatching a worker or changing execution presets, read
[Delegation](references/delegation.md).

## Work a task

1. Read `bb tasks show ABC-12 --json`. Identify the completion criteria,
   current status, blockers, and relevant attachments before acting.
2. Proceed when every blocker is `done` or `canceled`. Otherwise report the
   blocker and wait for explicit approval to proceed. CLI warnings do not
   enforce this gate.
3. Fetch every relevant attachment with
   `bb tasks attachment get <attachment-id> --out <path>` before relying on
   its content. Before adding or removing files, or selecting another machine,
   read [Attachments](references/attachments.md).
4. If this thread was not delegated from Tasks, attach it with
   `bb tasks attach ABC-12`. Dispatch attaches its worker automatically.
5. Do the work and follow [Reporting](#reporting) at meaningful milestones.
   Attach result files that belong with the task.
6. Set the status with `bb tasks update ABC-12 --status <status>`: `in_review`
   when required review remains, `done` only when completion criteria are met.
   Keep task-to-thread links when work completes, enters review, is handed off,
   is replaced, fails, or moves to other work. Detach only when the user
   explicitly requests removal of that task-to-thread link, with
   `bb tasks detach ABC-12`. Detaching does not stop the thread or change the
   task status. Retained links grant no new ownership or reporting authority.

## Reporting

At meaningful milestones, write one short result or current-state sentence,
a blank line, and up to three flat Markdown bullets. Use plain language, real
newlines, and one idea per bullet. Aim for 40-80 words; shorter updates are
valid. Keep material limits visible even when this requires a longer update.
Combine related changes and omit unchanged updates.

State the outcome, next step, and any blocker or exact decision needed and its
effect. For review or completion, name passed, unrun, or blocked checks.
Distinguish worker-reported results from checks you verified yourself.

Keep logs, file lists, full commit hashes, internal IDs, and detailed handoff
evidence in the attached thread or an artifact. Preserve exact commits and
baselines in the handoff. Link to the detail with `[worker](bbthread://thr_abc123)`,
`[subtask](bbtask://ABC-13)`, or an existing PR/attachment link. Use real
destinations. Task-card directives belong in chat responses, not comments.

### Reporting level

- A subtask reports its own result, relevant checks, and remaining work.
- An epic reports overall progress, current work, and the next dependency or
  decision. Summarize each child result's effect instead of copying its report.

Only the agent already responsible for a parent refreshes its summary when
handling a child completion, blocker change, or decision. Read current task
state, including relevant children, before posting; old comments are not
current evidence. Count only `done` children as done. Child done counts do not
prove epic acceptance; name remaining integration or acceptance work. Treat
unavailable or conflicting state as unknown.

Use existing authorized handoff routes. Parent summaries wait for their owner
to handle an event; these rules add no polling, wakeups, or coordinator.
Reporting grants no permission to dispatch, restructure tasks, notify, or
approve work. Before notifying a thread, read
[Notify the latest responder](references/task-records.md#notify-the-latest-responder).

These writing rules apply when an agent loads the updated skill or receives a
new prompt. They are not enforced comment limits. Leave historical comments,
task descriptions, stored presets, and previously delivered prompts unchanged.

### Post a multiline comment

Use a quoted heredoc so Markdown backticks and shell expressions stay literal.
Replace the placeholder task and thread IDs in this review-readiness example:

```sh
bb tasks comment ABC-12 --body "$(cat <<'REPORT'
**The change is ready for review.**

- Focused checks pass for `parse()` and literal `$(name)` input.
- Next: complete the required review.
- [Evidence](bbthread://thr_abc123).
REPORT
)"
```

### Blocked decision

```md
**Release is blocked on permission checks.**

- The current check cannot prove that a person approved the run.
- Choose whether to wait for the fix or accept this temporary limit.
- [Evidence and effects of each choice](bbthread://thr_abc123).
```

### Epic progress

```md
**2 of 9 subtasks are done; safe dispatch is in progress.**

- Manual run controls now let the next worker proceed.
- Next: finish safe dispatch, then interrupted-dispatch recovery.
- Whole-epic acceptance remains unverified. [Current subtask](bbtask://ABC-13).
```

## Link tasks in chat

When referring the user to a task, emit one task-card directive per line:

```md
::task{key="ABC-12"}
```

An optional `title="…"` supplies a fallback while the task loads or if it no
longer resolves. Use the comment links in [Reporting](#reporting) inside tasks.

## Manage task records

Before listing tasks across a project, changing hierarchy or dependencies,
or repairing thread links, read
[Task records](references/task-records.md).
