# Tasks

Acceptance conditions remain in [the project-settings spec](specs/tasks-project-settings/spec.md); technical decisions remain in [design.md](design.md). The approved deliveries are name editing first, then color editing in the same project table. Preserve project identity, prefix, task keys, folder, BB link and the linked BB workspace. Do not add an API, migration, dependency or unrelated Manage refactor.

User feedback approved the table in place of the selector planned at revision `20db7c8da2c9b00a6c2f9545f934fb1e38dbc886`, with stable loading and save layout. This is a replacement, not a second editor option. Delivery 1 preserves and displays saved color read-only; interactive color editing belongs to delivery 2.

Each delivery includes its tests and documentation. Before acceptance, the owner checks completion evidence and applicable project validation and clean-context review requirements for code changes. Each delivery runs relevant rendered and integration tests, package tests, typecheck, lint and build, and records keyboard/compact-layout results. Show an early working UI preview before final acceptance checks. Report unrelated or unavailable checks explicitly without expanding scope. Installed-code replacement and live-data validation require separate approval; this checklist does not authorize worker dispatch.

The change owner updates these checkboxes manually after checking completion evidence. Complete delivery 1 before delivery 2. Unrelated Manage error-handling cleanup is not a prerequisite.

## 1. Rename Tasks projects in settings

- [x] 1.1 Add Manage > Projects as an identity-keyed table with current name, read-only prefix and saved color, keeping Labels the default and Labels/Presets/Folders available; verify rendered tests distinguish duplicate names by prefix and identity and row editing does not change Tasks browsing scope or BB workspace.
- [x] 1.2 Keep each row's name draft identity-bound with explicit per-row Save/Cancel and blank-name blocking; verify local edits and Cancel send no update, Cancel clears that row's errors and restores latest loaded values, other row drafts remain independent, and name-only saves preserve any existing color.
- [x] 1.3 Save through updateProject with exactly project ID, trimmed name and unchanged saved color, applying returned values immediately and using one synchronous single-flight table guard; verify repeated activation sends one request, pending editing/Save/Cancel is blocked across rows and unchanged drafts cannot save.
- [x] 1.4 Keep failed-save errors local to the row and retain the name draft for retry; verify an alert, successful manual retry and unchanged prefix, folder, BB link and linked workspace.
- [x] 1.5 Provide separate loading, successful empty, inventory failure and Retry states; verify stale rows cannot save, successful removal removes only the old keyed row without transferring its draft, ordinary refreshes preserve dirty drafts and Cancel uses latest loaded values.
- [x] 1.6 Preserve the saved-response baseline when projects:changed arrives before Save settles or refresh fails afterward; verify deferred-RPC tests retain pending drafts, responses take precedence over overlapping inventory reads, and inventory failures are not reported as failed saves.
- [x] 1.7 Refresh existing project consumers after a successful rename through projects:changed; verify integration tests prove persistence and visible updates without reload or task-route change and unchanged project identity, prefix, task keys, saved color, folder and BB link.
- [x] 1.8 Document Manage > Projects, the project table, name editing, independent row drafts, explicit per-row Save/Cancel and unchanged prefixes in the Manage description and PLUGIN_OVERVIEW.md; verify documented paths and behavior match rendered tests.
- [x] 1.9 Record delivery checks and keyboard/compact-layout observations for table rows, name, Save, Cancel, Retry and alerts; verify accessible controls, stable displayed rows and control widths during loading/refresh/save, no invented initial project count, and no horizontal page overflow.

## 2. Change Tasks project colors in settings

- [x] 2.1 Add the existing named color palette to each identity-bound table row's color control; verify rendered tests show current color, local-only choices, preserved out-of-palette values until deliberate replacement, and both draft fields reset safely on that row's Cancel without changing other row drafts.
- [x] 2.2 Save name and color together through the existing update operation; verify pending controls and the single-flight table guard, unchanged-draft blocking, failure-retained fields and retry, dirty refreshes, removal, inventory failure, delayed-event safeguards and stable loading/save layout still hold for both fields.
- [x] 2.3 Refresh project consumers after combined saves through projects:changed; verify integration tests prove displayed/persisted name and color updates without reload or route change, preserve identity/prefix/task keys/folder/BB link, and never rename or recolor the linked BB workspace.
- [x] 2.4 Document combined row editing, custom-color preservation and per-row Save/Cancel in operating documentation; verify examples match the implemented table and retain the name delivery's independent-draft and prefix guidance.
- [x] 2.5 Check the assembled table by keyboard and at compact width; record accessible names, alerts, named color choices, palette wrapping, reachable Save/Cancel/Retry, stable loading/save layout and no horizontal page overflow.
- [x] 2.6 Run focused project-settings and Manage tests, full npm test, npm run typecheck, npm run lint and npm run build in bb-plugin-tasks-plus, and complete the required clean-context code review; record results, resolve blockers and report unrelated failures or unavailable live checks without expanding scope.
