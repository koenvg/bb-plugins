# Proposal

## Why

Task comments add controls and reporting work that the user does not need. Remove the feature completely so tasks hold requirements and current state, while linked threads hold discussion and work reports.

## What Changes

- Remove comment history, the Activity section and composer, drafts, author/provider presentation, notification controls, and the `m` comment shortcut from every task detail destination.
- **BREAKING** Remove `bb tasks comment`, comment RPCs, activity RPCs, comment realtime events, and comment fields/sections from task reads. Remove comment ownership from attachment APIs.
- Remove automatic system comments for dispatch, status changes, dependency resolution, and thread completion/failure. Keep the underlying state changes, links, and live thread cards.
- **BREAKING** Add a forward migration that deletes stored task comments and removes their schema. Convert existing comment-owned attachments to task-owned attachments before removing comment ownership, preserving files and download URLs.
- Remove comment reporting instructions, examples, demo data, and import behavior. Direct useful work reports and user questions to existing linked threads; retain status and review gates.
- Keep PR review comments, browser annotations, native thread messages, and inactive historical Orchestrator records outside this removal.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tasks-fork`: Define comment-free task interfaces, destructive comment migration, task-only attachments, and import compatibility.
- `tasks-split-view`: Remove comments and comment drafts while preserving editing, attachments, selection, and native pane lifecycle safeguards.
- `tasks-keyboard-shortcuts`: Remove the comment action and shortcut help entry; keep typing protection in retained editors.
- `task-dependencies`: Replace automatic unblocked comments with state/badge updates without notification.
- `task-progress-reporting`: Move outcome reporting to linked threads without a replacement task timeline or reporting API.
- `task-agent-context`: Remove comment reads and posting instructions; retain full task requirements, task attachment references, and intent-specific guidance.
- `bb-orchestrator`: Remove the ordinary-comment preservation exception while retaining inactive Orchestrator history and native-worker independence.

## Impact

- Primary project: `bb-plugin-tasks-plus`, including `db`, `shared/contract.ts`, `api`, `cli`, `attachments`, `delegate`, `lifecycle`, `steer`, task detail/activity views, shell state, bundled Tasks skill, documentation, tests, and navigation fixtures.
- Deploy server and frontend together. Existing comment callers will fail as unavailable or invalid rather than use compatibility stubs. Previously delivered worker prompts cannot be rewritten; their comment commands will no longer work.
- Comment text is permanently removed from the active Tasks database when the implementation migration runs. A pre-upgrade database backup is the recovery route, not an in-product archive or toggle.
- Existing specs explicitly require comment preservation and must change. In-flight `tasks-navigation-performance`, `task-markdown-preview`, and `task-detail-commands` plans contain comment-related assumptions and need reconciliation if implemented together. This proposal does not edit those plans.
- No new runtime dependency or replacement activity abstraction is required. Task descriptions, statuses, dependencies, presets, attachment content, worker links, mentions, and unrelated plugin comments remain supported.
