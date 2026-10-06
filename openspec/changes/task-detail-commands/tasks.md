# Tasks

Acceptance conditions remain in [the command spec](specs/task-detail-commands/spec.md); technical decisions and stable command IDs remain in [design.md](design.md). The target remains the loaded, shown task in the Tasks panel.

Each delivery includes its tests and documentation. Before acceptance, the owner checks completion evidence and applicable project validation and clean-context review requirements for code changes. For every delivery, run relevant rendered command tests, package typecheck, lint and plugin build, and verify its commands keyboard-only in running BB in both layouts, through the palette and a temporary personal binding. Use disposable records for state-changing checks and remove temporary bindings. Show an early working UI preview before final acceptance checks. Unavailable host checks remain explicit, not passes.

The change owner updates these checkboxes manually after checking completion evidence. This checklist does not grant implementation or installation authority or establish acceptance. Complete deliveries 1 through 6 in that order.

## 1. Change task properties through BB commands


- [ ] 1.1 Add the typed ten-command definition table with the stable IDs and titles in design decision 1 and append its registrations to the existing commands; verify registration tests cover all ten IDs, no default bindings and preservation of the five existing command IDs and behavior.
- [ ] 1.2 Supply task-scoped targeting and panel-local action registration with the current route, rendered panel root and loaded task readiness; verify rendered tests reject All, Active, Manage, focused list/board rows, embedded views, loading/error/missing tasks and hidden mounted task panels.
- [ ] 1.3 Guard availability and execution against stale route/task identity, unavailable handlers and ambiguous visible sessions; verify rerender, reload and unmount tests show no old-task action, queued task intent or unintended navigation, and clean registration after mounting again.
- [ ] 1.4 Keep palette availability separate from single-key overlay/typing guards; verify a shown task remains eligible while a host-style palette temporarily makes the background inert or aria-hidden, while CSS/HTML-hidden retained panels remain ineligible.
- [ ] 1.5 Connect Change status, Set priority and Edit labels to the existing menu openers shared with single-letter shortcuts; verify keyboard choices save only the open task, opening or canceling saves nothing, and In progress retains blocked-work confirmation.
- [ ] 1.6 Open only the shown status, priority or labels control in wide and narrow layouts; verify initial keyboard focus and Escape return use the visible control, with existing mouse and single-letter behavior intact.
- [ ] 1.7 Make property-menu activation survive palette-close focus handoff; use a scoped UI deferral only if host ordering needs it, and verify tests cancel deferred activation when its task session changes or unmounts.
- [ ] 1.8 Document command titles, Cmd+Shift+P, Settings > Keyboard, open-task-only targeting and property focus in the README and bundled Tasks skill; verify titles match registrations and descriptions do not promise list/board or embedded targeting.

## 2. Set due dates through a task command


- [ ] 2.1 Connect Set due date to a controlled due-date picker using the existing detail menu state; verify keyboard preset selection, custom date input, removal and Escape leave data unchanged until a choice is made.
- [ ] 2.2 Apply the established shown-layout and palette-close focus behavior to due dates; verify only the visible picker opens in either layout and Escape returns to its visible trigger without stale activation, with existing mouse behavior intact.
- [ ] 2.3 Document Set due date and its explicit choice/removal behavior in the README; verify the instructions match the rendered picker tests and keyboard-only checks.

## 3. Change the linked BB project through a task command


- [ ] 3.1 Connect Change linked BB project to a controlled picker with a compact inline trigger and shared loaded tracker/BB-project options; verify the command is unavailable before the tracker project loads and opens only the visible picker in both layouts.
- [ ] 3.2 Identify the tracker project and explain that its link affects all its tasks; verify selection initialization, dismissal without saving, save/unlink through updateProject, retained errors, and no task move, thread move or delegation call.
- [ ] 3.3 Apply visible-control focus, Escape return and cancellable palette-close handoff to the linked-project picker; verify keyboard tests in both layouts never focus a hidden duplicate.
- [ ] 3.4 Document shared tracker-project scope and explicit save/unlink in the README; verify the text matches picker behavior and keyboard-only checks.

## 4. Dispatch the open task through a preset picker


- [ ] 4.1 Expose the shown DispatchControl's actual preset and busy readiness; verify listing and execution reject loading, missing presets and outstanding delegation, even when a hidden layout duplicate is idle, and repeated invocation queues no dispatch.
- [ ] 4.2 Reuse the existing preset-menu opener without selecting the last preset; verify open/Escape makes no delegation call, explicit keyboard selection delegates once for the current task, and existing blocked-work confirmation and error handling remain intact.
- [ ] 4.3 Apply shown-layout and palette-close focus handoff to dispatch; verify focus enters the visible menu, Escape returns to its trigger, and stale deferred activation is canceled on task change or unmount.
- [ ] 4.4 Document that Dispatch task... opens a menu and only selecting a preset starts an agent; verify the README matches rendered tests and deliberate keyboard open/cancel/selection on disposable work.

## 5. Focus the open task's comment draft


- [ ] 5.1 Connect Write a comment to the existing editor ref with readiness checks; verify execution focuses the end of the same unsent draft, preserves notification settings and makes no submission.
- [ ] 5.2 Preserve editor focus after palette closure with scoped cancellable UI deferral only if needed; verify task change or unmount cancels stale focus, hidden/embedded views are excluded, and typing does not trigger bare-letter task shortcuts.
- [ ] 5.3 Document that Write a comment focuses rather than posts; verify README wording matches rendered tests and keyboard checks with an existing draft.

## 6. Navigate between open tasks through BB commands


- [ ] 6.1 Connect Previous task and Next task to existing TaskPager handlers without another sibling query; verify pager order/scope, absent or loading destinations, binding no-ops at boundaries, narrow-layout navigation and fresh targeting of the newly opened task.
- [ ] 6.2 Connect Back to the shell's existing backFromTask handler in the loaded task session; verify the existing project list/board destination and All tasks direct-link fallback, with no task update or delegation call.
- [ ] 6.3 Document navigation alongside existing pager shortcuts; verify the README promises current pager semantics rather than a new filtered-list ordering.
- [ ] 6.4 Run npm test, npm run typecheck and npm run lint in bb-plugin-tasks-plus; verify all pass, including shell, list/board keyboard, rail, dispatch and editor regressions.
- [ ] 6.5 Run bb plugin build in bb-plugin-tasks-plus; verify the bundle contains all registrations using the existing SDK contract with no new dependency or backend change.
- [ ] 6.6 Verify the assembled ten-command workflow keyboard-only in running BB in wide and narrow layouts, including palette-close focus, Escape, property updates, linked-project scope, safe dispatch, preserved comment drafts, pager boundaries and Back; verify switching away disables commands even if the task stays mounted, using disposable records for mutations.
- [ ] 6.7 Assign a temporary free modifier binding in Settings > Keyboard; verify the same action works only on the open task, not lists, boards, hidden retained panels or other BB pages, then remove it and confirm all ten commands have no plugin defaults.
