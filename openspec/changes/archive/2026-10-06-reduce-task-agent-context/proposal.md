# Proposal

## Why

Tasks Plus adds lengthy instructions and task history to ordinary agent requests. Koen wants less automatic context and no intermediate milestone comments, while keeping useful task controls and Code Cleanup's separate task-recording policy.

## What Changes

- Replace the lengthy delegated-worker report-back contract with a short instruction for assigned scope, relevant checks, task status and retained thread links. Preserve task requirements, blockers, attachment references, preset instructions and explicit extra instructions.
- Remove intermediate milestone-comment instructions entirely. Recommend comments only for review readiness, completion, failure, blockers or a required user decision. Remove fixed word targets, bullet templates and automatic parent-summary duties.
- Resolve task mentions to a task key, title, full description and a neutral pointer to read current details. Remove automatic status/property, subtask, attachment, comment and thread dumps, and remove the mention's action contract.
- Stop inserting recent comments automatically into delegated-worker prompts. Keep comments and comment-owned attachments available through existing reads.
- Keep a small Tasks skill entry point. Load reporting examples and task-management mechanics only for the operation requested. A task reference or read-only question is not an assignment to attach a thread, implement, comment or change status.
- Add regression budgets for plugin-authored context, without truncating user content or treating guidance as enforced model behavior.

## Capabilities

### New Capabilities

- `task-agent-context`: Small, intent-specific delegation, mention and skill context, with additional state and operation guidance read only when needed.

### Modified Capabilities

- `task-progress-reporting`: Replace milestone, fixed-format and automatic parent-summary guidance with short event-based outcome comments at both task-work entry points.

## Impact

- Source and tests in `bb-plugin-tasks-plus/delegate/` and `mentions/`.
- `bb-plugin-tasks-plus/skills/tasks/`, reporting guidance tests and package documentation.
- Existing rich-context and reporting assertions must change. Comment storage, rendering, CLI commands, notification targeting, dependency rules, task statuses and thread-link retention stay unchanged.
- No database migration, new dependency, provider change or live configuration update is required.

## Non-goals

- Orchestrator removal is separate work in `bbthread://thr_zrmcc5g9p5`. This change removes unrelated structured-report instructions from ordinary worker prompts, not orchestration runtime tools or records.
- Do not change Code Cleanup, its enabled state or custom prompts. It remains record-only and creates or reuses tasks for later fixes, not automatic refactoring.
- Do not remove UI views, activity indicators, mentions, task cards, attachments or history. Do not change comment notification defaults or delete system activity comments.
- Do not rewrite stored task descriptions, comments or presets, or inject instructions into existing provider sessions. This proposal authorizes planning only.
