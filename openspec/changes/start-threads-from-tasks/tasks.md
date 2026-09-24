# Tasks

## 1. Task-scoped creation and recovery

- [x] 1.1 Add a durable per-task launch claim in the plugin SQLite migration and shared eligibility checks for unfinished tasks, prerequisites, existing links, and project membership; verify server tests reject blocked, completed, and cross-project attempts without spawning.
- [x] 1.2 Add a `tasks_start` RPC that forwards the BB composer request's input and execution selections to `threads.spawn`, then links the returned thread and marks the task In progress with Focus attention; verify server tests cover edited prompt forwarding, unchanged stored prompt, navigation result, and BB spawn failure.
- [x] 1.3 Prevent concurrent submissions and conflicting task mutations during a launch; seed task/claim metadata on the thread and reconcile an interrupted link without a second spawn. Verify server tests for two simultaneous calls, stale manual links, reload recovery, and uncertain outcomes.
- [x] 1.4 Document in `bb-task-board/README.md` that task start uses same-project threads, a pending launch is recoverable, and existing manual linking and status controls remain available; verify the described behavior against server tests.

## 2. Task-specific composer flow

- [x] 2.1 Add Start and Open thread actions to the task board with an explanation for unfinished prerequisites, and route Start to a task-ID subpath that loads the full task; verify app tests for action states, off-page tasks, and navigation.
- [x] 2.2 Render BB's full new-thread composer on that page with the task prompt, task project, and per-task draft key; add a Back action and preserve the draft when leaving without submitting. Verify app tests for prompt/project seeds, available host controls, and unchanged task state on cancel.
- [x] 2.3 Wire composer submission to `tasks_start`, show project mismatch and submission errors without clearing the draft, and navigate to the resulting or already linked thread; verify app tests for success, failure, existing links, and edited prompt handling.
- [x] 2.4 Update `bb-task-board/README.md` and `bb-task-board/PLUGIN_OVERVIEW.md` to describe Start, review-before-send, and Open thread; verify the instructions match the tested UI flow.

## 3. Integration verification

- [x] 3.1 Run `npx vitest run`, `npx tsc --noEmit`, and `bb plugin build` from `bb-task-board/`; verify all pass and the built plugin includes the task-specific composer flow.

## 4. Operator recovery and review fixes

- [x] 4.1 Add task-scoped resolution for unresolved launch claims: reject active/stale attempts, recheck for the claimed thread, link a known same-project thread, or release only after explicit confirmation. Verify server tests for each action, missing or cross-project threads, failed SDK reads, and unchanged task state on release.
- [x] 4.2 Refresh the task-specific page on `tasks-changed`, add Recheck and manual recovery controls for unresolved claims, and link pending task details to that page. Verify app tests for pending-to-linked realtime updates, active-launch gating, manual link, and confirmed release without automatic spawn.
- [x] 4.3 Make the composer failure test change the selected project and assert the submitted request carries it and the rejected draft remains editable; verify the focused app test passes.
- [x] 4.4 Update task-board documentation for the recheck, same-project link, release warning, and separate resubmission; verify it matches the tested recovery flow.

## 5. Final integration checks

- [x] 5.1 Run the full task-board Vitest suite, TypeScript check, BB plugin build, OpenSpec strict validation, and diff whitespace check after recovery changes; verify all pass.
