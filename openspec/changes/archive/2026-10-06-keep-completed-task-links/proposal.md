# Proposal

## Why

Completed tasks lose their thread-header chip because the Tasks skill tells workers to detach when their work ends. Keep the task-to-thread link so the user can still see the task status and open the task after completion.

## What Changes

- Tell agents to keep task-to-thread links after completion, review, handoff, replacement, failure, or a change of work unless the user explicitly requests removal of the link.
- Align the bundled Tasks skill, its task-record repair reference, delegated-worker instructions, and README with this rule.
- Make the existing header contract explicit for Done tasks and add regression coverage for link retention and explicit detach.
- Keep manual detach available. No automatic restoration of missing links or changes to existing task data are included.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-thread-start`: Require agents to preserve task-to-thread links by default and detach only on an explicit user request.
- `thread-header-task`: State that linked Done tasks remain visible and openable in the thread header.

## Impact

- Agent guidance in `bb-plugin-tasks-plus/skills/tasks/SKILL.md` and `skills/tasks/references/task-records.md`.
- Initial worker instructions in `bb-plugin-tasks-plus/delegate/index.ts` and related README text.
- Guidance, delegation/API integration, and thread-header tests in Tasks Plus.
- No new dependencies, API shapes, database schema, ownership model, or header layout.
- Updated guidance applies when an agent reads the skill or receives a new worker prompt. Previously delivered prompts and existing detached links remain unchanged.
