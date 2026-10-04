# Tasks

## 1. Project settings entry and draft editing

- [ ] 1.1 Add failing slot tests for opening Projects from Manage, labelled controls, current values, duplicate project names distinguished by prefix, and retained Labels/Presets/Folders tabs. Verify the new tests fail because the Projects tab is missing before implementation.
- [ ] 1.2 Add `views/manage/projects-section.tsx` and the Projects tab in `manage-panel.tsx`, keeping the Labels default and showing project prefixes as read-only context. Verify the entry tests pass and selecting a settings project does not navigate the Tasks route or BB workspace.
- [ ] 1.3 Add tests and implement identity-bound name/color drafts, Cancel, project selection reset, blank-name blocking, and preservation of colors outside the palette. Verify local changes and Cancel send no update and a new selection cannot inherit another project's draft.
- [ ] 1.4 Update the Manage description and `PLUGIN_OVERVIEW.md` with the Tasks Manage > Projects path, explicit Save/Cancel behavior, and unchanged prefixes. Verify the documented path matches the rendered controls and states that project selection discards unsaved local edits.

## 2. Saving and inventory recovery

- [ ] 2.1 Add deferred-RPC tests and implement Save through `updateProject` with exactly project ID, trimmed name, and color, immediate saved values from the response, and a synchronous single-flight guard. Verify repeated activation sends one request, pending controls are unavailable, and unchanged drafts cannot save.
- [ ] 2.2 Add failure and retry tests and implement local save errors that preserve the draft. Verify a rejected save shows an alert, keeps entered values, and succeeds on retry without changing prefix, folder, or BB-link fields.
- [ ] 2.3 Add tests and implement separate loading, successful empty, inventory failure, and Retry states. Verify failed refreshes with stale rows block new saves, successful removal removes the old editor, and ordinary refreshes preserve dirty drafts while Cancel uses the latest loaded values.
- [ ] 2.4 Add realtime tests for an inventory event before a save response and a failed refresh after a successful save. Verify the response remains the saved baseline, pending drafts are not erased, and an inventory failure is not reported as a failed save.

## 3. Integration and verification

- [ ] 3.1 Add or extend an integration test using existing fixtures to save name/color and refresh project consumers through `projects:changed`. Verify displayed values update without a task-route switch and persisted project ID, prefix, task keys, folder assignment, and linked BB project remain unchanged.
- [ ] 3.2 Check keyboard operation, accessible names and error alerts, and compact-panel layout. Verify the selector, name, named color choices, Save, Cancel, and Retry are usable and the extra tab/form do not cause horizontal page overflow; record the observed result.
- [ ] 3.3 From `bb-plugin-tasks-plus`, run focused project-settings and Manage tests, then `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. Verify all checks pass or report specific unrelated failures without expanding this change.
