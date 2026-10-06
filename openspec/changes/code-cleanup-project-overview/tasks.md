# Tasks

## 1. Shared summary read

- [ ] 1.1 Add public RPC tests in `settings.test.ts` for standard-project summaries covering explicit/inherited On/Off, custom/default prompt sources, disabled-custom combinations, name ordering, and no writes; verify the tests fail before the summary endpoint exists.
- [ ] 1.2 Add the strict `listProjectSummaries` contract, shared resolver operation, and server registration; verify the new tests pass, summaries omit prompt text, all rows use one captured default, and existing `listProjects`, `getProject`, mutations, and CLI tests remain unchanged.
- [ ] 1.3 Document the read-only overview and its two distinct source labels in the package README; verify the terms match the RPC results and that no storage migration, factory policy change, or new dependency is documented or introduced.

## 2. Project table and row changes

- [ ] 2.1 Replace the project dropdown and inline project controls with the five-column overview and remove the inline editor mount; verify accessible UI tests show every standard project's saved values, alphabetical order, disabled-custom rows, default-control placement, and empty/loading/error/retry states without writes on view.
- [ ] 2.2 Connect switches and conditional Use default actions to the existing enablement RPC with one overview mutation lock; verify tests assert exact target/payload, pending-row feedback, blocked overlapping mutations, confirmed-only success, prompt preservation, unrelated-project preservation, and failure with manual retry.
- [ ] 2.3 Style the table using host tokens and labelled compact row blocks; update preview fixtures with mixed choices and long project names, then verify desktop and compact previews have no horizontal page overflow, hidden sources, or unreachable actions.
- [ ] 2.4 Update the README and plugin overview for direct row enablement and Use default; verify both distinguish default inheritance from global plugin enablement and explain that prompt text is preserved.

## 3. Prompt dialog and draft safety

- [ ] 3.1 Move `PromptContent` into a project-bound native modal with title, saved source, count, Edit/Preview, close control, and footer Reset/Cancel/Save; adapt current editor tests to open through Edit prompt and verify opening is read-only, disabled-project editing works, and no dropdown or editor remains below the table.
- [ ] 3.2 Preserve exact-source validation and saved-prompt preconditions while closing only after confirmed Save; verify dialog tests cover unchanged Save, whitespace/4,097-character rejection, exact multiline text, pending-write dismissal blocking, failure-retained drafts, concurrent replacement, and confirmed table-source updates.
- [ ] 3.3 Add the internal dirty-dismissal confirmation for Cancel, Escape, and the close control; verify Keep editing retains text, Escape from confirmation resumes editing, confirmed discard writes nothing, backdrop clicks do not dismiss, and no stacked dialog is created.
- [ ] 3.4 Add the internal Reset confirmation and immediate persisted reset while keeping the dialog open; verify cancel/failure/conflict retains the draft, successful Reset shows factory text and updates the row, enablement stays unchanged, and later Cancel does not undo a confirmed Reset.
- [ ] 3.5 Add accessible title/control names, safe-action confirmation focus, trigger focus return, and bounded scrolling dialog layout; verify component focus transitions and browser-preview focus containment, background inertness, Escape behavior, and reachable actions at desktop and compact widths.
- [ ] 3.6 Update README instructions for Edit prompt, Save-and-close, dirty dismissal, Reset's immediate persistence, and new-session limits; verify instructions and action names match the implemented dialog and preview.

## 4. Refresh and response isolation

- [ ] 4.1 Refresh summaries on settings notifications and reconnect with generation guards; verify integration tests cover default changes updating inherited rows only, CLI changes updating saved sources, and stale summary responses not replacing later confirmed mutations.
- [ ] 4.2 Retain the existing dirty-dialog baseline and reload/conflict behavior independently of overview refresh; verify concurrent Settings tests retain drafts during external changes, confirm discard before reload, and prevent late project-A responses from reopening or populating a later project-B dialog.
- [ ] 4.3 Preserve confirmed overview content on failed refresh, label it as last saved, block stale row mutations until reload, and offer manual retry; verify tests distinguish initial unknown state from stale known values and retain an open prompt draft during failures.
- [ ] 4.4 Document saved table values versus dialog drafts and explicit recovery after refresh or prompt conflict; verify the documented recovery actions match visible UI tests and do not promise automatic retry or draft persistence across app reload.

## 5. Package and browser integration

- [ ] 5.1 Run the complete Code Cleanup test suite, package typecheck, scoped lint/format checks, public-SDK checks, and plugin build; record commands and results and verify no other plugin API, stored settings, or agent contribution changes.
- [ ] 5.2 Run the Settings preview and verify the complete row-toggle, Use default, Edit/Preview, Save, discard, Reset, and failure/retry flows in a real browser using fixtures; record light/dark desktop and compact captures, keyboard focus/inertness checks, and any unavailable host checks.
- [ ] 5.3 Perform the implementation workflow's completion review and resolve blocking findings; verify the final diff matches the overview spec, preserves existing concurrency tests, and removes superseded selector/inline-editor code instead of leaving an unused alternate flow.
- [ ] 5.4 Validate this OpenSpec change and record final verification limits; verify all required artifacts are present and strict validation passes, and do not install a live build, alter live settings, archive changes, or change the related plan's unchecked tasks without a separate request.
