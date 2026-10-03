# Design

## Context

See [proposal.md](proposal.md) for motivation and the [Settings spec](specs/code-cleanup-settings/spec.md) and [guidance delta](specs/code-cleanup-guidance/spec.md) for requirements.

The package currently has `server.ts`, `project-settings.ts`, and `guidance.ts`, but no `bb.app` entry or declared Settings fields. It uses one synchronous `bb.agents.configure` callback. Its SQLite table stores `project_id`, `enabled INTEGER NOT NULL DEFAULT 0`, and nullable `prompt`; missing rows are off. `setPrompt` can insert a disabled row. Existing tests exercise the storage, CLI, and agent configuration through the official fake host.

The installed SDK is 0.5.9. It supports declarative boolean Settings fields, `settingsSection`, validated RPC, realtime invalidations, and frontend test helpers. The Settings section receives no project prop, so it must own an explicit selector. `tsconfig.json` currently includes only root `*.ts` files and has no JSX option.

The saved configuration was inspected during this discussion: all 12 current standard projects are explicitly enabled with project-specific task-creation prompts. Six have no linked task tracker. The factory prompt in the repository and main guidance spec still describe reporting only. This change deliberately updates that factory behavior, not stored custom text.

## Goals / Non-Goals

**Goals:**
- Keep configuration resolution and validation behind one module interface shared by CLI, RPC, and agent assembly.
- Add a discoverable Settings section using the public SDK and native BB styling.
- Preserve existing effective choices while adding a distinct inherited state.
- Keep errors and unsaved drafts visible instead of treating unknown or stale state as saved.

**Non-Goals:**
- BB core changes, a separate navigation page, or repository instruction files.
- A task-tracker creation UI, task dispatch, task scanning, or direct cross-plugin task writes.
- A new global custom-prompt system or migration of existing custom prompts to the factory text.
- A plugin-wide master switch beyond BB's existing global plugin enable switch.

## Decisions

### One default setting and one project Settings section

Define `enableByDefault` as a public boolean Settings descriptor with default `false`. Label it "Enable for projects without an override" and explain that it includes new projects but does not change explicit choices. BB renders and persists that field on the plugin detail page and exposes it through `bb plugin config code-cleanup set enableByDefault true|false`.

Add `app.tsx` with one `app.slots.settingsSection` registration for project controls. Set `bb.app` in the manifest and retain `bb.skills: []` so the policy is not duplicated as a skill. Keep the global field in the host-rendered form rather than building a second switch that writes the same value through RPC.

Alternative rejected: a global JSON map would be hard to edit safely and would bypass the existing project storage. A separate panel would hide configuration outside Settings.

### Inheritance without changing existing rows

Append two migrations to the existing `bb.storage.migrate` list: add nullable `enabled_override` constrained to 0 or 1, then copy each existing row's `enabled` into that column. Never edit the shipped migration statement. All existing rows, including prompt-only disabled rows, become explicit choices. Migration tracking prevents this backfill from running on later reloads and destroying newly inherited states.

Resolve enablement as `enabled_override ?? enableByDefault`. Missing rows and new prompt-only rows have a null override and follow the default. Project enable/disable writes both the old `enabled` column and the explicit override; Use default clears the override only. Keeping the legacy column avoids an unnecessary table rebuild and preserves the old schema's explicit values for a limited rollback. New code reads the override, not the legacy column.

Prompt writes do not change the override. Reset updates only prompt text; it must not insert an unintended explicit disabled choice. Expose resolved state with `enabled`, `enabledOverride: boolean | null`, stored `prompt`, and `effectivePrompt` so callers do not repeat this logic.

The plugin factory becomes async only to load `enableByDefault` before registration. Cache that value for the synchronous configure callback and update it through the Settings handle's `onChange`. Publish an invalidation after default changes. This keeps fresh-session reads current without making agent assembly asynchronous.

Alternative rejected: treating a missing row as the only inherited state fails when a user edits a prompt. Backfilling every missing project on upgrade would prevent new defaults from applying and would require unnecessary core project writes.

### Small shared Settings interface

Keep storage and atomic prompt comparison inside `project-settings.ts`. Put project validation and configuration actions behind a package-local module used by both the existing CLI and new RPC handlers. Keep the factory focused on registration; avoid a second resolver or duplicated validation branch for the UI.

Use a strict, runtime-validated contract in `rpc.ts`, with Zod 4 as a package dependency:
- `listProjects`: returns standard project IDs and names, without personal projects.
- `getProject`: accepts a project ID and returns its resolved configuration and current default.
- `setEnablement`: accepts a project ID and `enabledOverride: boolean | null`.
- `setPrompt`: accepts a project ID, `prompt: string | null`, and `expectedPrompt: string | null`. Null resets to the factory prompt.

Validate project existence and kind for reads and writes. Validate custom text as nonblank and at most 4,096 JavaScript string characters without trimming or transforming it. This preserves the existing CLI length rule and exact saved text. Atomically compare `expectedPrompt` to the stored value before UI Save or Reset; return a typed conflict result and current configuration without writing if it differs. A single SQLite transaction owns comparison and update. CLI prompt writes remain deliberate unconditional replacements, but use the same validation and storage actions.

Continue existing CLI commands and add `enablement reset --project ID` for Use default. Append the effective enablement source to `show` without removing its existing enabled/disabled and custom/default information. Publish a `settings.changed` invalidation after successful CLI or RPC project writes. Import only the contract type into the frontend so SQLite and backend dependencies are not bundled into the app.

Alternative rejected: calling CLI commands from the browser or exposing unrestricted SQL would add quoting, permissions, and validation problems. Saving an entire project snapshot for every control would let a toggle accidentally overwrite prompt text.

### Editing layout and states

The host-rendered default switch appears first. The custom section follows this shape:

```text
Project                     [ Select a project       v ]
Enable for this project      [ On / Off ]  [Use default]
Enabled by project override / Enabled by default

Prompt source: Custom / Plugin default
[ Multiline prompt editor                              ]
2713 / 4096 characters
[Save prompt] [Reset to plugin default]

Changes apply to newly constructed agent sessions.
Task recording requires BB Tasks and a linked tracker.
```

Do not auto-select a project based on a thread or route. Offer an explicit selection and show an empty state when no standard projects exist. The enable switch displays effective state and saves an explicit choice. Use default removes that choice and is unavailable while already inherited. The editor shows effective prompt text even while the project is disabled.

Use a single-column layout, BB host tokens, labelled controls, visible focus states, and wrapped supporting text. Stack action buttons on narrow widths. Do not introduce a brand color, theme, or fixed-width editor.

Keep loading, saved snapshot, prompt draft, dirty state, pending write, and failure distinct. Disable project writes before load and while a write is pending. Guard each read response with the selected project ID and request generation. Freeze the target ID for writes and block project switching while a write is pending. Confirm discard/cancel before switching a dirty project; Reset confirms removal of the saved custom prompt and any draft. Report success only after a confirmed save. A failed save retains the draft.

Subscribe to `settings.changed` and refetch on reconnect. Refresh clean views. For dirty drafts, retain text and show a saved-state-change notice. A prompt conflict offers explicit Reload with a discard confirmation; do not silently retry with a new precondition. Invalidation failure cannot turn a persisted write into a reported failed save; reconnect or explicit refresh remains a recovery path.

Alternative rejected: autosaving each textarea change hides persistence and makes prompt edits prone to races. Relying only on request cancellation does not protect against a response that already completed.

### Factory task-creation guidance

Update `defaultGuidance` to the verified behavior of the saved prompts from this discussion. Keep it within 4,096 characters. Use literal BB project IDs only to resolve `linkedBbProjectId` from `bb tasks project list`; use the tracker prefix or ID for task commands. Search open statuses with cursor pagination, reuse duplicates, create actionable descriptions, add existing labels only, and record known required blockers with `bb tasks update --blocked-by`.

Missing or ambiguous tracker, unavailable CLI, create failure, and dependency failure produce honest reports rather than wrong-project tasks or success claims. The prompt prohibits unrelated cleanup, dispatch, current-task status changes, and notifications. The plugin never invokes task creation itself.

Reset now means this task-creation factory prompt. Document that change clearly because current source tests explicitly require reporting-only behavior. Stored custom text still replaces the factory prompt and can intentionally specify different behavior.

### Public test seams

Use the real fake-host SQLite storage for migration fixtures. Test resolution through the CLI, RPC, Settings updates, and `resolveAgentConfiguration`, not private implementation spies. Cover prompt-only rows, inherited prompt edits, reload, and all excluded contexts.

Use `loadPluginApp` and `renderSlot` from `@get-bb/plugin-sdk/testing/app` with jsdom for registration and UI behavior. Drive interactions by accessible names and assert RPC inputs, visible saved state, drafts, and failures. Live BB verification covers sidebar discovery, host form rendering, themes, compact layout, realtime, and actual plugin reload. It does not require a spawned agent or a real cleanup task.

Add frontend test dependencies and include `.tsx` sources in TypeScript checks. Keep the existing public-SDK import scanner and run it against the complete package.

## Risks / Trade-offs

- [Existing overrides make the default switch appear ineffective] -> Explain precedence beside both controls and provide Use default. Never clear explicit choices automatically.
- [Saving a prompt accidentally pins enablement] -> Give new prompt-only rows a null override and test this with both default values.
- [Stale default in synchronous agent assembly] -> Initialize before registration and update the cached value through the Settings change callback; test without reload.
- [Concurrent prompt edits lose text] -> Compare stored prompt atomically for UI Save and Reset; retain drafts on conflicts.
- [New factory behavior surprises Reset users] -> Name it the task-creation default and document the reporting-only behavior change.
- [No tracker or blocked CLI access] -> Show the requirement in Settings and retain the prompt's report-and-ask fallback. Do not provision trackers.
- [Frontend harness cannot prove native layout or Settings discoverability] -> Capture desktop and compact live evidence before declaring the implementation complete.

## Migration Plan

1. Implement and test the append-only migration using legacy enabled, disabled, and prompt-only fixtures. Do not operate on the live database during development.
2. Before installing or reloading the new build, record current project settings and the global default. Take a consistent SQLite backup through the supported database backup mechanism, not a raw copy of a live WAL database. Preserve the prior plugin source/build for rollback.
3. Build and typecheck the complete package. Install/reload the correct plugin path only during apply verification, then confirm it is running and visible in Settings. Keep `enableByDefault` false on upgrade; enabling that setting is a separate user action.
4. Verify the 12 saved project choices and exact prompts remain unchanged. Exercise UI writes on fake-host fixtures first; for live checks, use an explicitly scoped test project or restore each temporary value from its snapshot. Do not create tasks or trackers.
5. Roll back to the prior build and, when necessary, restore the pre-upgrade backup while the plugin is stopped. The old build cannot represent inheritance or the new global default; restoring its backup intentionally discards configuration edits made after upgrade. Warn before doing that. Do not delete unrelated plugin state.
