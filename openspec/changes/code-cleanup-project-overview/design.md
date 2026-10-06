# Design

## Context

See [proposal.md](proposal.md) for scope and the [overview spec](specs/code-cleanup-project-overview/spec.md) for acceptance behavior.

The current Settings app has a project dropdown, selected-project enablement actions, and an inline prompt editor. `PromptContent` already provides Edit/Preview, a character count, exact-source editing, and named icon actions. `useProjectSettings` owns request generations, prompt baselines, dirty-draft reconciliation, realtime refresh, reconnect, and write protection. Keep those contracts rather than rewriting persistence.

The backend exposes `listProjects`, `getProject`, `setEnablement`, and atomic `setPrompt` through a strict RPC contract. Listing returns names and IDs only. `projectConfiguration` validates standard projects and shares storage with the CLI and agent configuration. No database migration is needed.

The related `code-cleanup-settings-controls` plan describes the previous layout. Its implementation is present, despite unchecked planning tasks. Treat this change as a UI follow-up against the current source, not a request to repeat that earlier change. The proposed overview spec adds the cross-project and modal interaction contract; it does not replace the pending settings capability or change agent-guidance policy.

## Goals / Non-Goals

**Goals:**

- Make saved project choices visible together while keeping prompt text out of the summary payload.
- Keep row changes and dialog editing small, separate interfaces over the existing configuration module.
- Preserve safe drafts, correct project targeting, and confirmed persistence through the layout change.

**Non-Goals:**

- New storage, factory guidance, global controls, or an independent configuration cache on the server.
- Bulk operations, filters, search, pagination, prompt comparison, or a second Settings route.
- Importing another plugin's UI internals or introducing a shared overlay framework.

## Decisions

### 1. Add one summary RPC without changing existing callers

Add `listProjectSummaries` to `rpc.ts` and register it in `server.ts`. Return an array with `id`, `name`, effective `enabled`, nullable `enabledOverride`, and `promptSource: "custom" | "default"`. Do not return custom or factory prompt text. Leave `listProjects` unchanged for compatibility and internal project validation.

Build summaries in `projectConfiguration` from standard projects and the same storage resolver used by `getProject`. Capture the default once per summary request. Sort by project name, with ID as a stable tie-breaker. Reads must not insert rows.

Alternative rejected: fetching every full prompt through one `getProject` call per row adds unnecessary payload and request coordination. Changing `listProjects` would disturb existing callers for no benefit.

### 2. Keep the table visible and edit only in a dialog

Keep the host-rendered default-enable field above the custom Settings section. Replace the dropdown, selected-project switch group, reload area, and inline editor with the overview. Retain the session note and task-recording help.

Use five columns: Project, Enabled, Setting source, Prompt, and an action column. Each loaded row has a switch with a project-specific accessible name, a conditional Use default action beside Project override, a plain saved-source label, and Edit prompt. Use native BB tokens, modest row separation, neutral states, and visible focus. Avoid new cards or color-only status cues.

A row's Edit prompt action opens the editor for that project's ID and name. Highlight only the active row while its dialog is open. The table remains visible but modal-inert. There is no editor or duplicate project selector below the table.

On compact widths, present each row as a labelled vertical block without hiding the source distinctions. Preserve semantic row and control associations. Long names wrap; actions stay reachable. No special project-count behavior is required.

Alternative rejected: expanding a row or showing the editor below it conflicts with the user's explicit dialog requirement.

### 3. Serialize row writes and reconcile summaries from confirmed state

Keep a small overview state with rows, loading/refresh error, one pending row, and its mutation error. Reuse existing `setEnablement` operations. A switch saves the opposite of its last confirmed state as an explicit choice; Use default passes null.

Use one in-flight mutation lock for the overview. Disable row mutation controls and opening an editor while a row write is pending; identify the affected row with saving text. Do not optimistically assert success. On success, map the returned project state into the row summary. On failure, keep the confirmed value and show a row-specific retryable error.

Refresh the overview on existing settings invalidations and reconnect, with request-generation guards so an older summary cannot replace a later confirmed write. Keep prior content on refresh failure, mark it as last saved, and block stale row writes until a successful reload. Initial failure has no usable switches. Notification failure must not turn a confirmed mutation into a reported save failure.

Alternative rejected: concurrent per-row write queues add coordination that the user's overview task does not need. Automatic retry is not required.

### 4. Move the editor into a project-bound native modal

Use the platform's native HTML dialog with `showModal()` and `close()`, styled with host tokens. Native modality supplies background inertness and focus containment without a new dependency. Existing sibling Radix dialogs depend on package-specific portals and helpers, so do not copy or import that machinery.

Keep this prompt dialog as a small package-local component, owning its fixed project target, open lifetime, trigger reference, and dismissal confirmation. Reuse `PromptContent` and the selected-project read/draft logic after removing page-selection assumptions. Preserve the existing Edit/Preview tabs and public Markdown rendering. Move Save and Reset into clearly named dialog actions rather than duplicate toolbar actions.

Title: "Cleanup guidance for <project name>". Show the saved source, source editor, count, preview, reload/conflict feedback when needed, and new-session note. Footer: Reset to plugin default, Cancel, Save. Include a labelled close control. Save is unavailable while unchanged, pending, or in an unresolved prompt conflict.

Fit the dialog to desktop and compact viewports with a bounded height, a scrolling content region, and reachable header/footer actions. Scope dialog styles explicitly: a native top-layer dialog must still inherit the intended BB colors and typography.

Native dialog behavior must be checked in a real browser; jsdom-only tests cannot prove inertness or focus containment.

### 5. Give dismissal, Save, and Reset distinct outcomes

Opening is read-only. Bind requests and mutations to the opening project ID and dialog generation. Late results must not reopen a closed dialog or affect a later project.

- Confirmed Save updates the summary, closes the dialog, and returns focus to its trigger. Use the existing atomic saved-prompt precondition.
- Save validation, transport failure, or conflict retains the draft in the open dialog. Keep existing explicit reload and conflict recovery rather than force-saving stale text.
- Cancel, Escape, or the close control closes a clean dialog. A dirty dialog changes to an internal discard confirmation with Keep editing and Discard changes. Focus Keep editing first. Escape in that confirmation returns to editing. Do not dismiss on backdrop clicks.
- Block dismissal and duplicate writes during persistence.
- Reset changes to an internal confirmation, not a stacked modal. Confirming immediately persists null using the saved-prompt precondition. On success, show factory text, update the row to Plugin default, and leave the dialog open. The confirmation must explain that Reset saves immediately and keeps enablement unchanged. Cancel after a successful Reset does not undo that saved reset.
- Failed Reset retains the prior draft. Keep Reset unavailable when there is neither a custom prompt nor a changed draft.
- Closing discards only unsaved edits. If an earlier Reset was confirmed, that persisted reset remains.

Use one confirmation view at a time and focus its safe action. On returning to editing, restore focus to the initiating editor control. On final close, return focus to the row's Edit prompt action; if that row no longer exists, focus the overview heading.

External changes refresh table summaries independently of a dirty dialog. Keep the dialog's saved-prompt baseline until Save or explicit reload. Show saved-source changes separately from the unsaved draft, retaining the current stale-write protection.

Alternative rejected: native confirm prompts or stacked modal confirmations disconnect the action from the project and complicate keyboard focus.

## Risks / Trade-offs

- [Modal semantics are not covered by the current inline-editor tests] -> Add dialog-boundary tests and verify focus containment, Escape, scroll, and backdrop behavior in the browser preview.
- [Overview refresh can overwrite a confirmed row write] -> Share request-generation invalidation with the pending mutation and test delayed responses.
- [Moving the editor loses draft or precondition protection] -> Retain the existing draft resolver and atomic prompt operations, with tests through the dialog's public actions.
- [Reset and Cancel can appear contradictory] -> Explain immediate persistence in Reset confirmation; close only cancels unsaved edits.
- [Host themes or compact viewports clip the native dialog] -> Use host tokens, scoped modal styles, wrapped text, and a scrollable content region. Verify light, dark, and compact views.
- [Older OpenSpec plans still describe the previous layout] -> Reference this as the follow-up layout contract when syncing or archiving the related change; do not mark its unchecked tasks complete as part of this work.

## Migration Plan

1. Implement and verify the summary RPC without modifying storage or existing RPC outputs.
2. Replace the Settings composition and adapt preview fixtures and tests to mixed project states and a dialog.
3. Run package tests, typecheck, public-SDK checks, build, and browser checks before live installation.
4. If live installation or mutation checks are requested during implementation, snapshot saved configuration first and restore only intentional test changes. Do not create tasks, trackers, or provider sessions.
5. Roll back by reinstalling the prior plugin build. The database and CLI remain compatible; no data rollback is required.
