# Proposal

## Why

Task comments are hard to scan because they mix current progress with implementation evidence and internal references. In the inspected sample of eight tasks, 47 of 53 agent comments were single paragraphs; parent summaries also lagged behind completed subtasks.

## What Changes

- Give agents a common reporting format through the bundled Tasks skill and the delegated worker's report-back instructions. Use one short result or state sentence, a blank line, and up to three Markdown bullets. Aim for 40-80 words, with shorter updates allowed when sufficient.
- Keep the task comment focused on the outcome, next step, and any blocker, decision, or material limitation. Summarize relevant checks without moving test logs, full commit hashes, file lists, or internal identifiers into the progress update.
- Keep detailed evidence in the attached thread or a task attachment, with a useful reference from the comment. Preserve actionable risks and verification limits in the short update.
- Separate reporting levels. Epic comments summarize overall progress and the next dependency or decision. Subtask comments describe that subtask's result, checks, and remaining work. Threads hold the detailed investigation and implementation record.
- Tell the agent already responsible for the parent to refresh its summary when it handles a meaningful child completion or blocker change. Read current task state first and combine related changes into one update. This adds no polling, automatic notifications, or new coordinator role.
- Add examples and focused tests for both instruction entry points and the existing Markdown comment path.

## Capabilities

### New Capabilities

- `task-progress-reporting`: Agent reporting guidance for concise task comments, evidence references, and current epic/subtask summaries.

### Modified Capabilities

None. Existing task statuses, dependency rules, delegation, comment storage, notification targeting, and task/thread lifecycle independence remain unchanged.

## Impact

- Update `bb-plugin-tasks-plus/skills/tasks/SKILL.md`, the report-back section in `bb-plugin-tasks-plus/delegate/index.ts`, and their focused tests and examples.
- Verify that ordinary Markdown bullets and real newlines survive the existing CLI, storage, and comment rendering path. No renderer replacement or UI feature is planned.
- No new commands, APIs, settings, dependencies, database fields, or migrations.
- No edits to existing task records, historical comments, task hierarchies, user presets, or running threads. New instructions affect workers that receive them; they do not retroactively rewrite old prompts.
- The separate `bb-orchestrator` change keeps ownership of orchestration, durable reports, and worker handoffs. Detailed handoff evidence remains available to workers outside the short human-facing summary.
- A pinned current-state panel and expandable comment history are deferred. This proposal authorizes planning only, not implementation or installation.
