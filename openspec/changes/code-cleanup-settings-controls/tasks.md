# Tasks

## 1. Preserve configuration and add inheritance

- [ ] 1.1 Add legacy SQLite fixtures for enabled, disabled, prompt-only, and absent projects, including exact multiline custom text; verify the new inheritance assertions fail before changing storage.
- [ ] 1.2 Append the nullable `enabled_override` migration and one-time legacy backfill in `project-settings.ts`; verify fixture choices and exact prompts survive migration and repeated reload.
- [ ] 1.3 Implement resolved state and independent enablement/prompt operations, including clearing an override; verify absent and new prompt-only rows follow both default values, while explicit disabled rows remain disabled.
- [ ] 1.4 Document precedence and upgrade preservation in the package README; verify its examples match the storage behavior tests and do not imply that the default overwrites explicit choices.

## 2. Default control and agent assembly

- [ ] 2.1 Define the `enableByDefault` boolean Settings descriptor with default false, initialize its cached value before registering agent configuration, and update it through `onChange`; verify fake-host Settings writes change fresh configuration resolution without reload.
- [ ] 2.2 Connect the shared resolver to the existing single agent contribution; verify default-on, default-off, explicit overrides, custom replacement, reload, personal/projectless exclusion, and side-chat exclusion in `agent.test.ts`.
- [ ] 2.3 Add the default-setting CLI example and new-session warning to the README and command reference; verify the declared field is visible to the Settings harness and the documented `bb plugin config` command uses its actual key.

## 3. Share CLI and validated Settings operations

- [ ] 3.1 Add the runtime validator dependency and a strict Settings contract in `rpc.ts`; verify malformed inputs, invalid project kinds, unknown IDs, whitespace-only prompts, and over-limit prompts are rejected through the fake-host RPC interface without writes.
- [ ] 3.2 Share project validation and state operations across RPC and existing CLI handlers; implement project listing, resolved reads, field-scoped enablement writes, and prompt Save/Reset; verify valid RPC writes and CLI reads agree, and prompt changes preserve enablement and exact text.
- [ ] 3.3 Implement atomic saved-prompt preconditions for UI Save and Reset; verify concurrent CLI or RPC replacement produces a conflict, preserves newer text, and cannot be overwritten by a stale request.
- [ ] 3.4 Add `enablement reset --project ID`, retain existing CLI behavior, and append the effective enablement source to `show`; verify command help, existing commands, override reset, and inherited/custom combinations in `server.test.ts`.
- [ ] 3.5 Publish Settings invalidations after confirmed default or project changes without making notification delivery a prerequisite for persisted success; verify fake-host signals reflect successful writes and rejected/conflicting writes leave configuration unchanged.
- [ ] 3.6 Document the new CLI command, inherited state, prompt preconditions, and multiline input using safe `--text` argument passing; verify all documented flags against generated help and do not repeat the current unsupported multiline `--text-stdin` claim.

## 4. Factory guidance records follow-up tasks

- [ ] 4.1 Update `guidance.test.ts` to require native `bb tasks` routing, duplicate checks with pagination, actionable descriptions, existing-label checks, known blockers, fallback reporting, and no unrelated work or dispatch; verify the reporting-only factory prompt fails these assertions first.
- [ ] 4.2 Replace the factory guidance with the task-creation policy while keeping custom text untouched; verify every tested project ID produces at most 4,096 characters and guidance/agent tests confirm custom replacement and Reset behavior.
- [ ] 4.3 Document the factory behavior change and missing-tracker fallback in the README, overview, and command reference; verify the docs distinguish agent-created follow-ups from plugin-created tasks and state that Reset uses task-creation guidance.

## 5. Settings UI and editor behavior

- [ ] 5.1 Add the frontend entry, manifest `bb.app`, JSX/source inclusion, and React/React DOM, Testing Library, and jsdom test dependencies; verify installation, TypeScript checks, and Settings registration through `loadPluginApp`.
- [ ] 5.2 Implement the explicit standard-project selector, effective enable switch/source, Use default action, and empty/loading/error states; verify accessible-name interaction tests match RPC payloads and block writes before load or while pending.
- [ ] 5.3 Implement the source-labelled multiline editor, character counter, Save, and confirmed Reset; verify successful saves, exact text, validation errors, disabled-project editing, enablement preservation, and failure-retained drafts through `renderSlot` tests.
- [ ] 5.4 Implement project-scoped request guards, pending-write selection blocking, and dirty-draft discard/cancel flow; verify delayed project-A reads cannot overwrite project B and cancel retains the draft.
- [ ] 5.5 Subscribe to Settings invalidations and reconnect refresh, preserving dirty drafts and showing conflict/reload recovery; verify clean CLI-change refresh, dirty-change notices, stale-prompt conflicts, and explicit discard before reload in frontend tests.
- [ ] 5.6 Apply host-token styling, keyboard labels/focus, wrapped help text, and narrow-layout button stacking; verify a representative desktop/compact preview early and address layout issues before the full live matrix.
- [ ] 5.7 Document the Settings location, default precedence, per-project actions, Reset semantics, new-session limit, and tracker requirement; verify UI labels and help copy match the README and that `PLUGIN_OVERVIEW.md` no longer describes the plugin as headless.

## 6. Package and live integration checks

- [ ] 6.1 Run the complete package test suite, `npm run typecheck`, public-SDK import scan, and `bb plugin build`; verify all pass against the complete change and the app bundle excludes backend SQLite code and duplicate guidance contributions.
- [ ] 6.2 Snapshot saved project choices and exact prompts, record the installed plugin source/build, and take a consistent database backup before live install/reload; verify the snapshot covers the 12 configured standard projects and excludes task or tracker mutation.
- [ ] 6.3 Install/reload the tested build on the intended BB host and inspect status/logs; verify Code Cleanup appears in the Settings sidebar and its detail page renders both the host default control and project section.
- [ ] 6.4 Exercise a scoped live UI read/write/reset/default flow with snapshot restoration, then verify CLI/UI agreement and unchanged unrelated projects; record evidence and confirm no tasks, trackers, workers, or provider sessions were created for the check.
- [ ] 6.5 Verify desktop and compact layout, keyboard access, light/dark or active host-theme compatibility, and reload persistence; attach focused evidence and explicitly record any unavailable live checks rather than claiming unit tests prove them.
- [ ] 6.6 Run the single fresh-context read-only completion review required by the implementation workflow against the complete change; resolve blocking findings, rerun affected checks, and record final verification and the new-session/task-tracker limits before declaring completion.
