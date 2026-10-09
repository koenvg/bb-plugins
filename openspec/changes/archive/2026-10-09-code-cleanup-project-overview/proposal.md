# Proposal

## Why

Code Cleanup Settings shows one project at a time. The user cannot quickly see which projects are enabled or which have custom prompts. A project overview with direct enablement controls and a prompt dialog makes these choices visible without opening every project.

## What Changes

- Replace the project dropdown and inline editor with a table below the existing default-enable control. List all standard projects by name, with effective On/Off, enablement source, saved prompt source, and an Edit prompt action.
- Let each row save an explicit On/Off choice or return enablement to the default. Keep prompt text unchanged by these actions.
- Open prompt editing in a modal dialog, not below the table. Keep the existing Edit/Preview behavior, exact-text validation, character count, and concurrent-write protection.
- Close the dialog after a confirmed Save and update the table. Confirm dirty-draft dismissal and prompt Reset inside the dialog. Keep failed or conflicting drafts open.
- Preserve keyboard access, focus return, compact layouts, and current loading, failure, realtime, and reconnect behavior. Unknown settings must not appear as Off.

## Capabilities

### New Capabilities

- `code-cleanup-project-overview`: Cross-project configuration overview, field-scoped row controls, and project-bound prompt-dialog editing.

### Modified Capabilities

None. Agent guidance and configuration semantics remain unchanged. The existing `code-cleanup-guidance` capability already covers independent project choices, custom text, and lifecycle boundaries.

## Impact

- Affects `bb-plugin-code-cleanup/app.tsx`, `app.css`, `use-project-settings.ts`, `rpc.ts`, `configuration.ts`, the Settings preview, relevant UI/RPC tests, and Settings documentation.
- Adds a validated summary-list RPC backed by the existing configuration resolver. Existing project reads, mutations, CLI commands, database schema, saved settings, and global default control remain intact.
- Uses the existing public BB Plugin SDK and React stack. Use an existing accessible dialog pattern; no new dependency is required by this proposal.
- This is a focused follow-up to `code-cleanup-settings-controls`, whose Settings implementation is present in this checkout although its task checklist is unchecked. This change supersedes that plan's dropdown and inline-editor layout only. It does not repeat its migration or factory-guidance work, change its task status, or archive either change.
- No bulk actions, new filters, global prompt customization, task-tracker provisioning, worker dispatch, BB core changes, or changes to live provider sessions.
