# Proposal

## Why

Task and comment attachment cards currently download Markdown instead of showing it. Koen wants a read-only dialog over the task, with the same spacious Markdown presentation planned in the `markdown-reader` change.

## What Changes

- Open task and comment attachments with case-insensitive `.md` or `.markdown` filename extensions in a dialog over the task. Keep other file downloads and image previews unchanged.
- Provide Preview, exact read-only Raw, Download, and Close controls. Start in Preview, close with Escape, and restore focus to the attachment card.
- Use one shared Markdown document module for the attachment dialog and the planned file reader. Share parsing, typography, heading navigation, code styling, and content safety rather than copy a renderer into Tasks.
- Keep attachment reads separate from workspace, host, and thread-storage reads. Task attachments have no filesystem-relative document root.
- Add bounded UTF-8 loading, loading/empty/error/unsupported states, Retry, and protection against late responses after closing or changing tasks. Keep the existing download route and uploaded-file size limit.
- Preserve the task underneath the dialog, including its route, scroll position, drafts, and workflow state. Do not change file-opening preferences or require the standalone reader plugin to be installed.

## Capabilities

### New Capabilities

- `task-markdown-preview`: Read-only task and comment attachment dialogs with bounded loading, exact Raw, downloads, safe document destinations, and accessible dismissal.
- `shared-markdown-document`: A common Markdown presentation module used by both the attachment dialog and file reader, with source-specific destination adapters and shared behavior tests.

### Modified Capabilities

None. Existing task and plugin-verification contracts remain in force. The `markdown-reader` capability exists only in an active change, not in the main spec inventory. This change adds its shared-renderer dependency without replacing that change's file-opener requirements.

## Impact

- Tasks UI at `bb-plugin-tasks-plus/views/detail/attachments.tsx` and `views/activity/task-activity.tsx`, plus a new shared attachment-dialog owner and loader.
- A private build-time package for the shared document module, with `react-markdown`, `remark-gfm`, bounded highlighting, scoped CSS, fixtures, and tests. Both plugin bundles include this package; there is no runtime plugin-to-plugin dependency.
- A bounded authenticated attachment preview read in Tasks, while preserving the existing upload, download, removal, and CLI contracts. No database migration or filesystem endpoint is needed.
- The planned `bb-plugin-markdown-reader` must consume the same module. Its full implementation remains owned by `markdown-reader`; shared integration is a completion dependency, not a reason to claim an absent consumer works.
- Package lockfiles, per-package checks, CI dependency setup, and Tasks documentation need updates during implementation. No installation, publication, preference change, or code change is authorized by this proposal workflow.
