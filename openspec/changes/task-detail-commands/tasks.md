# Tasks

## 1. Task-scoped command registration and lifecycle

- [ ] 1.1 Add the typed ten-command definition table with the stable IDs and titles in design decision 1, append it to the existing registrations, and extend `shell/commands.test.tsx` to verify all ten registrations, absence of default bindings and preservation of the five existing command IDs and behavior.
- [ ] 1.2 Implement the task-detail command module and panel-local registration interface under `shell/`; wire the shell's current task route, real rendered panel root and `TaskDetail` loaded readiness into it, and verify tests reject All, Active, Manage, focused list/board targets, embedded views, loading/error/missing tasks and a hidden mounted task panel.
- [ ] 1.3 Guard both availability and execution against stale route/task identity, unavailable handlers and ambiguous visible sessions; verify rerender/unmount tests show no old-task action, no queued task intent, no unintended panel navigation, and clean re-registration after mounting again.
- [ ] 1.4 Keep palette availability separate from the single-key overlay/typing guards; verify a visible task remains eligible while a host-style palette dialog temporarily makes its background inert or aria-hidden, while CSS/HTML-hidden retained panels remain ineligible.
- [ ] 1.5 Document the ten command titles, Cmd+Shift+P entry point, Settings > Keyboard binding workflow and open-task-only availability in `bb-plugin-tasks-plus/README.md` and `skills/tasks/SKILL.md`; verify documented titles match registrations and do not promise list/board or embedded-view targeting.

## 2. Property and linked-project commands

- [ ] 2.1 Share the existing status, priority and labels menu openers between single-letter shortcuts and task command handlers in `views/detail/index.tsx`; extend rendered keyboard tests to execute each command, choose a value on the current task and verify no update occurs merely by opening or dismissing a picker, including blocked-work confirmation for In progress.
- [ ] 2.2 Make `DueDateMenu` controlled through detail menu state and register Set due date; verify tests for keyboard preset selection, a custom date, removal, Escape dismissal and unchanged data until a choice is made.
- [ ] 2.3 Make the linked-BB-project picker controlled, add a compact trigger to `InlineProperties`, and share the loaded project/BB-project options across layouts; verify both inline and rail commands open only the visible picker, and the command is unavailable while the tracker project is not loaded.
- [ ] 2.4 Identify the tracker project and explain the link's effect on all its tasks in the picker; extend `views/detail/rail.test.tsx` to verify copy, selection initialization, dismissal without saving, save/unlink through `updateProject`, and no task move, thread move or delegation call.
- [ ] 2.5 Make property picker initial focus and Escape focus restoration work from command invocation in both layouts; verify rendered tests focus the visible interactive control, never a hidden duplicate, and preserve existing mouse and single-letter picker tests.
- [ ] 2.6 Document Set due date and Change linked BB project in the README, including the shared tracker-project scope and explicit save/unlink behavior; verify the copy matches the rendered picker and existing update workflow.

## 3. Dispatch and comment commands

- [ ] 3.1 Expose `DispatchControl`'s actual menu readiness to the detail action owner and register Dispatch task... only when the shown control has presets and is not busy; verify commands are unavailable during preset loading, with no presets and during an outstanding delegation, including when the hidden layout's duplicate is idle.
- [ ] 3.2 Reuse the existing preset-menu opener without dispatching the last preset; verify command open/Escape makes no delegate call, keyboard preset selection calls delegation once for the current task, and existing blocked-work confirmation and error handling still run.
- [ ] 3.3 Register Write a comment using the existing comment-editor ref with readiness checks; verify tests preserve an unsent draft, focus its end, make no comment submission and retain the agent-notification setting.
- [ ] 3.4 Exercise palette-close focus handoff for a property menu and comment focus; add a scoped, cancellable UI deferral only if needed by host ordering, and verify tests cancel activation when its task session changes or unmounts before the handoff completes.
- [ ] 3.5 Document that Dispatch task... opens a menu but selecting a preset starts an agent, while Write a comment only focuses the draft; verify README descriptions match rendered tests and do not imply automatic dispatch or posting.

## 4. Task navigation commands

- [ ] 4.1 Register Previous task and Next task from the existing `TaskPager` handlers without adding another sibling query; verify tests follow the pager order/scope, hide absent or loading destinations, navigate in the narrow layout, and use the newly opened task for subsequent property commands.
- [ ] 4.2 Register Back from the shell's existing `backFromTask` handler within the loaded task session; verify tests match the existing destination from a project list/board and the All tasks fallback from a direct link, with no task update or delegation call.
- [ ] 4.3 Document Previous task, Next task and Back alongside the existing pager shortcuts in the README; verify the text promises current pager semantics rather than a new filtered-list ordering.

## 5. Integration verification

- [ ] 5.1 Run `npm test`, `npm run typecheck` and `npm run lint` in `bb-plugin-tasks-plus`; verify all pass, including existing shell, list/board keyboard, rail, dispatch and editor regressions.
- [ ] 5.2 Run `bb plugin build` from `bb-plugin-tasks-plus` and verify the frontend bundle builds with all registrations using the existing SDK contract and no added dependency or backend change.
- [ ] 5.3 Reload the plugin in a running BB and verify all applicable commands through Cmd+Shift+P using only the keyboard in wide and narrow task layouts: focus, Escape return, property updates, linked-project scope, dispatch open/cancel and deliberate selection, comment draft focus, pager boundaries and Back. Verify switching away from Tasks disables task commands even if the task remains mounted. Use a disposable task/project for state-changing checks.
- [ ] 5.4 In BB Settings > Keyboard assign a temporary free modifier shortcut to a task command, invoke it on an open task and then from a list/board or another BB page, and verify it performs the same action only on the open task; remove the temporary binding and confirm the ten commands have no plugin defaults.
