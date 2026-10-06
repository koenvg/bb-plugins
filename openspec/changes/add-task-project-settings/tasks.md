# Tasks

Acceptance conditions remain in [the project-settings spec](specs/tasks-project-settings/spec.md); technical decisions remain in [design.md](design.md). The approved deliveries are name editing first, then color editing and the complete combined editor. Preserve project identity, prefix, task keys, folder, BB link and the linked BB workspace. Do not add an API, migration, dependency or unrelated Manage refactor.

Each delivery includes its tests and documentation. Before acceptance, the owner checks completion evidence and applicable project validation and clean-context review requirements for code changes. Each delivery runs relevant rendered and integration tests, package tests, typecheck, lint and build, and records keyboard/compact-layout results. Show an early working UI preview before final acceptance checks. Report unrelated or unavailable checks explicitly without expanding scope. Installed-code replacement and live-data validation require separate approval; this checklist does not authorize worker dispatch.

The change owner updates these checkboxes manually after checking completion evidence. Complete delivery 1 before delivery 2. Unrelated Manage error-handling cleanup is not a prerequisite.

## 1. Rename Tasks projects in settings


- [ ] 1.1 Add Manage > Projects with labelled selection, current name and read-only prefix, keeping Labels the default and Labels/Presets/Folders available; verify rendered tests distinguish duplicate names by prefix and identity and selection does not change Tasks browsing scope or BB workspace.
- [ ] 1.2 Keep name drafts identity-bound with explicit Save/Cancel, blank-name blocking and selection reset; verify local edits and Cancel send no update, Cancel clears errors and restores latest loaded values, selection discards only its local draft, and name-only saves preserve any existing color.
- [ ] 1.3 Save through updateProject with exactly project ID, trimmed name and unchanged saved color, applying returned values immediately and using a synchronous single-flight guard; verify repeated activation sends one request, pending editing/selection/Cancel is blocked and unchanged drafts cannot save.
- [ ] 1.4 Keep failed-save errors local and retain the name draft for retry; verify an alert, successful manual retry and unchanged prefix, folder, BB link and linked workspace.
- [ ] 1.5 Provide separate loading, successful empty, inventory failure and Retry states; verify stale rows cannot save, successful removal removes the old keyed editor without transferring its draft, ordinary refreshes preserve dirty drafts and Cancel uses latest loaded values.
- [ ] 1.6 Preserve the saved-response baseline when projects:changed arrives before Save or refresh fails afterward; verify deferred-RPC tests retain pending drafts and do not report an inventory failure as a failed save.
- [ ] 1.7 Refresh existing project consumers after a successful rename through projects:changed; verify integration tests prove persistence and visible updates without reload or task-route change and unchanged project identity, prefix, task keys, saved color, folder and BB link.
- [ ] 1.8 Document Manage > Projects, name editing, explicit Save/Cancel, selection discard and unchanged prefixes in the Manage description and PLUGIN_OVERVIEW.md; verify documented paths and behavior match rendered tests.
- [ ] 1.9 Record delivery checks and keyboard/compact-layout observations for selector, name, Save, Cancel, Retry and alerts; verify accessible controls and no horizontal page overflow.

## 2. Change Tasks project colors in settings


- [ ] 2.1 Add the existing named color palette to the identity-bound editor; verify rendered tests show current color, local-only choices, preserved out-of-palette values until deliberate replacement, and both draft fields reset safely on Cancel or project selection.
- [ ] 2.2 Save name and color together through the existing update operation; verify pending controls and single-flight protection, unchanged-draft blocking, failure-retained fields and retry, dirty refreshes, removal, inventory failure and delayed-event safeguards still hold for both fields.
- [ ] 2.3 Refresh project consumers after combined saves through projects:changed; verify integration tests prove displayed/persisted name and color updates without reload or route change, preserve identity/prefix/task keys/folder/BB link, and never rename or recolor the linked BB workspace.
- [ ] 2.4 Document combined editing, custom-color preservation and Save/Cancel in operating documentation; verify examples match the implemented editor and retain the name delivery's selection-discard and prefix guidance.
- [ ] 2.5 Check the assembled editor by keyboard and at compact width; record accessible names, alerts, named color choices, palette wrapping, reachable Save/Cancel/Retry and no horizontal page overflow.
- [ ] 2.6 Run focused project-settings and Manage tests, full npm test, npm run typecheck, npm run lint and npm run build in bb-plugin-tasks-plus, and complete the required clean-context code review; record results, resolve blockers and report unrelated failures or unavailable live checks without expanding scope.
