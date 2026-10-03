# Tasks

## 1. Searchable project picker

- [x] 1.1 Check the declared cmdk version's arrow and Ctrl+N/P behavior after installing the existing locked dependencies; verify the available options against its types/source and add a focused keyboard test that uses the real primitive rather than a mocked command component.
- [x] 1.2 Add `shell/project-switcher.tsx` using the existing responsive Dialog and command primitives, project ids as choice identities, names/prefixes, folder context, and a current-project marker; verify accessible names, duplicate-name choices, and compact rendering in `shell/project-switcher.test.tsx`.
- [x] 1.3 Add case-insensitive name/prefix search with one result order, first-result highlighting on open/query changes, and cleared state on reopen; verify search, no matches, query reset, and highlighted-id reconciliation in picker tests.
- [x] 1.4 Enable Ctrl+N/P and arrow navigation without wrapping, keep input focus and selected-result visibility, and select only with Enter or pointer; verify both result boundaries, filtered-result navigation, unchanged query text, and one selection callback per action in picker tests.
- [x] 1.5 Keep key handling local to the picker and ignore composition and unrelated modifier combinations; verify keys outside the picker cause no picker action and typing `c`, `p`, and `v` triggers no background Tasks shortcut.
- [x] 1.6 Add loading, no-projects, no-matches, and inventory-error states plus a separately focusable retry button; verify retry works, status/retry elements cannot be selected as projects, unsettled or failed inventory prevents selection, and removed projects cannot be selected.
- [x] 1.7 Implement search autofocus, Escape/close cancellation, and stable Tasks focus restoration without restoring focus to an obsolete task on selection; verify cancel emits no navigation, resets on reopen, and leaves focus on a connected usable control.

## 2. BB palette command and safe navigation

- [x] 2.1 Add `switch-project` to the existing command and panel-intent contracts and explicitly handle all intent types in the shell; verify `shell/commands.test.tsx` includes all six titles with no default shortcuts and preserves New task and shortcut-help behavior.
- [x] 2.2 Mount the controlled picker in `TasksAppShellContent` and deliver the intent through the existing open-panel and pending-intent paths; verify an open board keeps its route while the picker opens, a closed panel opens one picker, and repeated execution cannot create duplicate dialogs.
- [x] 2.3 Request project selection through the shell's safe navigation with a destination project id and `view: null`, then close the picker without writing scope memory early; verify Enter and pointer requests use the same path, the old ticket selection clears after an accepted switch, destination view preferences and narrow fallback apply, and BB workspace navigation is not called.
- [x] 2.4 Add a deferred-save integration test using the existing browse/save fixtures; verify project navigation and remembered scope wait for a successful save, failure retains the originating task and draft with reachable retry controls, and retry commits the intended destination.
- [x] 2.5 Verify the change adds no board shortcut and leaves the header project menu intact; run the relevant shortcut-provider and browse-navigation tests, including a Shift+P regression assertion.
- [x] 2.6 Document the three-step flow, project-name/prefix search, Ctrl+N/P, Enter, and local Escape cancellation in `bb-plugin-tasks-plus/README.md`; verify the text states that this selects a Tasks tracker project, not BB's workspace project, and advertises no direct shortcut.

## 3. Integrated verification

- [x] 3.1 Run the focused picker, palette-command, shortcut, browse-navigation, and save-scope tests, then the full Tasks test suite, typecheck, lint, and plugin build; verify all pass without changing server, database, CLI, dependency manifests, or lockfiles.
- [x] 3.2 Reload the built plugin and check the real BB palette-to-picker handoff on desktop and compact layouts; verify search autofocus, Ctrl+N/P, arrow keys, Enter switching, Escape cancellation, visible current-project context, and retained drafts on a failed save. Record the observed result and any blocked live checks.

## Verification record

- `npm test -- --maxWorkers=2`: 86 test files and 951 tests passed.
- `npm run typecheck` and `npm run build` passed. Dependency manifests and lockfiles are unchanged.
- `npx --yes --package=oxlint -c 'npm run lint'` passed with four existing warnings outside the changed files. The package's lint command needs oxlint on PATH; no dependency was added.
- Installed the built `tasks-plus` plugin from this worktree. In Arc's existing session, checked BB's real command palette with Tasks initially closed and already open.
- Checked desktop and 410-by-740 compact layouts. The search field received focus; Ctrl+N/P and arrows changed the highlight without moving focus. Search matched names and prefixes. Enter selected a project. Escape returned focus to Tasks without switching. The current-project marker and Close control remained visible.
- Created one temporary tracker project and task for the save-failure check. A browser-local save interceptor returned HTTP 500 without writing the draft to the server. Selection closed the picker but kept the originating task route and draft; Retry save stayed visible. Removing the interceptor and retrying completed the intended switch.
- Removed the temporary task and project, verified the original five tracker projects remain, and restored the original BB Plugins scope. Existing Arc tabs and its login session were preserved.
- No live acceptance checks remain blocked. Direct Playwright attachment to Arc timed out; the checks used browser-use's existing connection and its raw CDP controls instead.
- The single read-only completion review approved the code with no blocking findings. Its remaining live-check note is resolved by the failed-save/retry evidence above. Review baseline: `ae0e46d2298e076275174fc40251b0387d965d33`, including all untracked files.
