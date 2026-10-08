Turn a plan into tracked tasks, hand each task to an agent, and see the worker's progress on the task itself.

## What you get

- A **Tasks** panel with list and board views, filters, and a detail page for each task.
- Projects with key prefixes such as `PROD-1`, nested folders, labels, priorities, due dates, subtasks, and file attachments.
- Markdown comments with a **Notify last responding agent** switch. The comment goes to the worker thread and resumes it when idle.
- A **Delegate** menu that starts a worker thread from a preset. A preset sets the provider, model, reasoning level, permission mode, and instructions.
- Live thread cards on each task and a **Task** panel action inside a thread.

## How it works

Link a tracker project to a bb project. Delegation creates and attaches a worker thread, moving `backlog` or `todo` tasks to `in_progress`. The worker receives full requirements, blockers, subtasks, attachment references and explicit instructions. Recent comment bodies stay out of the starting prompt.

Open the settings icon, then **Manage > Projects**, to change a Tasks project's name or color. Find its table row by prefix, edit the name or open its color control, then use that row's **Save** or **Cancel**. Each row keeps independent local name and color drafts. Color choices use the existing named palette. A custom color stays unchanged until you choose a replacement. Editing or choosing a color sends no update and does not change your Tasks browsing project. Cancel restores that row's latest loaded name and color. Save trims the name and saves both fields together. Prefix, existing task keys, folder and BB link stay unchanged, as does the linked BB workspace. During a save, all project-row editing and Save/Cancel controls are locked. Failed saves keep both drafts for manual retry; inventory errors have a separate **Retry** button.

Type `@` in the composer and choose **Tasks** to send a task key, title, full description and a pointer to current details as context. A mention does not assign work. Task pills and `::task{key="PROD-1"}` cards keep their existing navigation.

## For agents

The `bb tasks` CLI covers the full tracker: `create`, `list`, `show`, `update`, `comment`, `attachment`, `preset`, `delegate`, `attach`, `detach`, `threads`, `label`, `project`, and `folder`. Add `--json` for machine-readable output. The small `tasks` skill separates read-only questions from assigned work and loads operation details only when needed. Comments cover review readiness, completion, failure, blockers or user decisions. Required review keeps work `in_review`; `done` requires all completion gates.

Presets are user-defined. Create at least one before you delegate.
