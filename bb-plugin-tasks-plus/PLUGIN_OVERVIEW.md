Turn a plan into tracked tasks, hand each task to an agent, and see the worker's progress on the task itself.

## What you get

- A **Tasks** panel with list and board views, filters, and a detail page for each task.
- Projects with key prefixes such as `PROD-1`, nested folders, labels, priorities, due dates, subtasks, and file attachments.
- Markdown comments with a **Notify last responding agent** switch. The comment goes to the worker thread and resumes it when idle.
- A **Delegate** menu that starts a worker thread from a preset. A preset sets the provider, model, reasoning level, permission mode, and instructions.
- Live thread cards on each task and a **Task** panel action inside a thread.

## How it works

Link a tracker project to a bb project. Delegation creates and attaches a worker thread, moving `backlog` or `todo` tasks to `in_progress`. The worker receives full requirements, blockers, subtasks, attachment references and explicit instructions. Recent comment bodies stay out of the starting prompt.

Type `@` in the composer and choose **Tasks** to send a task key, title, full description and a pointer to current details as context. A mention does not assign work. Task pills and `::task{key="PROD-1"}` cards keep their existing navigation.

## For agents

The `bb tasks` CLI covers the full tracker: `create`, `list`, `show`, `update`, `comment`, `attachment`, `preset`, `delegate`, `attach`, `detach`, `threads`, `label`, `project`, and `folder`. Add `--json` for machine-readable output. The small `tasks` skill separates read-only questions from assigned work and loads operation details only when needed. Comments cover review readiness, completion, failure, blockers or user decisions. Required review keeps work `in_review`; `done` requires all completion gates.

Presets are user-defined. Create at least one before you delegate.
