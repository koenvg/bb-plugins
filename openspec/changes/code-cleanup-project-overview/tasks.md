# Tasks

Acceptance conditions remain in [the overview spec](specs/code-cleanup-project-overview/spec.md); technical decisions remain in [design.md](design.md). Preserve existing saved choices, exact prompt text, CLI behavior, factory guidance, default controls and new-session limits. This follow-up does not repeat the earlier migration or mark the unchecked code-cleanup-settings-controls plan complete.

Each delivery includes its tests and documentation. Before acceptance, the owner checks completion evidence and applicable project validation and clean-context review requirements for code changes. Each delivery runs the complete Code Cleanup tests, typecheck, scoped lint/format checks, public-SDK checks and plugin build, and records applicable real-browser Settings preview results in light/dark desktop and compact layouts. Show an early working UI preview before final acceptance checks. Unavailable host checks remain explicit.

The change owner updates these checkboxes manually after checking completion evidence. Complete delivery 1 before delivery 2. This checklist does not grant implementation or installation authority. Do not create tasks, trackers or workers, alter existing provider sessions, install live plugin code, change live settings, archive changes or alter the earlier plan's checkboxes without a separate request.

## 1. Show project settings and change enablement in the table


- [ ] 1.1 Cover read-only standard-project summaries through public RPC tests for explicit/inherited On/Off, custom/default prompt sources, disabled-custom combinations, name ordering and no writes; verify the cases pass through the registered endpoint.
- [ ] 1.2 Add the strict listProjectSummaries contract, shared resolver and server registration; verify summaries omit prompt text, use one captured default, and leave listProjects, getProject, mutations and CLI behavior unchanged.
- [ ] 1.3 Show the five-column overview below the default control while keeping existing prompt editing usable until delivery 2; verify accessible UI tests cover every standard project's saved values, alphabetical order, both source labels, disabled-custom rows and empty/loading/error/retry states without writes on view.
- [ ] 1.4 Connect switches and conditional Use default to existing enablement operations with one overview mutation lock; verify exact target/payload, pending-row feedback, blocked overlap, confirmed-only success, preserved prompts/unrelated projects and failure with manual retry.
- [ ] 1.5 Style the overview with host tokens and labelled compact rows; verify preview fixtures with mixed choices and long names show accessible project-specific controls, visible focus, all source labels and reachable actions without horizontal page overflow.
- [ ] 1.6 Refresh summaries on settings notifications and reconnect with generation guards; verify integration tests show default changes affect inherited rows only, CLI changes update saved sources, and stale reads cannot replace a later confirmed mutation.
- [ ] 1.7 Keep confirmed overview content on refresh failure, label it last saved, block stale mutations until reload and offer manual retry; verify tests distinguish unknown initial state from stale known values and preserve existing prompt drafts during failures.
- [ ] 1.8 Document the read-only overview, direct row controls, source labels, precedence, explicit recovery and new-session limits in the README and plugin overview; verify terms match RPC/UI behavior without implying global plugin enablement changes, prompt changes, automatic retry, a migration or a new dependency.
- [ ] 1.9 Record delivery checks and an early working table preview followed by real-browser toggle, Use default and failure/retry checks; verify existing prompt editing and its concurrency tests remain usable in this intermediate delivery.

## 2. Edit cleanup prompts in a safe dialog


- [ ] 2.1 Move PromptContent into a project-bound native modal opened by Edit prompt, with title, saved source, count, Edit/Preview, close control and Reset/Cancel/Save footer; verify tests cover read-only opening and disabled-project editing, and remove the superseded selector and inline editor rather than hide an alternate flow.
- [ ] 2.2 Preserve exact-source validation and saved-prompt preconditions, closing only after confirmed Save; verify unchanged Save, whitespace/4,097-character rejection, exact multiline text, pending-write dismissal/duplicate blocking, retained failed drafts, concurrent replacement and confirmed table-source updates without enablement or unrelated-project changes.
- [ ] 2.3 Confirm dirty Cancel, Escape and close inside the same dialog; verify Keep editing preserves text, Escape from confirmation resumes editing, confirmed discard writes nothing, backdrop clicks do not dismiss and no stacked dialog is created.
- [ ] 2.4 Confirm Reset inside the dialog and persist removal immediately while keeping it open; verify the confirmation explains immediate persistence, cancel/failure/conflict preserves the draft, success shows factory text and updates the row, enablement remains unchanged and later Cancel does not undo confirmed Reset.
- [ ] 2.5 Provide accessible names, safe-action confirmation focus, trigger focus return and bounded dialog scrolling; verify component focus transitions and real-browser focus containment, background inertness, Escape and reachable desktop/compact actions.
- [ ] 2.6 Keep the dirty-dialog baseline and explicit reload/conflict recovery independent of overview refresh; verify concurrency tests retain drafts on external changes, confirm discard before reload, refresh clean views on notifications/reconnect, and reject late project-A responses after close or opening project B.
- [ ] 2.7 Document Edit prompt, Save-and-close, dirty dismissal, immediate Reset, saved table values versus drafts, conflict/reload recovery and new-session limits; verify README instructions match visible actions and do not promise automatic retry or draft persistence across app reload.
- [ ] 2.8 Run complete package tests, typecheck, scoped lint/format checks, public-SDK checks and plugin build; verify no other plugin API, stored-setting format or agent contribution changes, and record each result.
- [ ] 2.9 Verify the complete table/dialog workflow in the real-browser Settings fixture; record light/dark desktop/compact captures, keyboard focus/inertness and Save, discard, Reset, conflict and failure/retry observations, distinguishing unavailable host checks.
- [ ] 2.10 Complete the code-change workflow's clean-context completion review and resolve blockers; verify the final diff follows the overview spec, preserves concurrency tests and removes the superseded UI.
- [ ] 2.11 Validate this OpenSpec change and record verification limits; verify required artifacts and strict validation, with no live installation/settings changes, archive action or completion claim for the earlier plan.
