# BBP-44 independent review

## Verdict

**Approve the reviewed source change. No actionable findings.** Installed acceptance remains blocked. This approval does not authorize activation, deployment, settings changes or production mutations.

Selected skill is `review`. The new cross-module task-command session, public registrations and focus lifecycle require a structural review. Baseline is `e9afeecce2d0b4675f3879bd04d2a5cd40af30fa`. Scope is the working tree, including all seven untracked source, test and documentation files. Generated dependencies and build caches are not authored changes.

I read the current proposal, design, command specification, task checklist, `verification/BBP-44/report.md`, comment-removal contract and private work plan. I used the requested tracked diff and `/dev/null` diffs for all new files. Each new-file diff returned the expected exit code 1.

## Assessment

- **Correctness and requirements.** `bb-plugin-tasks-plus/shell/commands.ts:9-28,62-67` registers the nine specified IDs without default bindings. The six original registrations retain their existing callbacks. The three enabled property handlers are shared with single-letter shortcuts in `views/detail/index.tsx:320-334`. The other six unavailable handlers and removed comment command match the approved scope.
- **Target ownership.** `shell/app-shell.tsx:149` creates command sessions only for task routes. `views/detail/index.tsx:604-608` requires a current, successfully loaded task with the matching route key. `shell/task-detail-commands.tsx:33-59` rejects disconnected, geometry-less and CSS/HTML-hidden panels, requires exactly one eligible session and exactly one matching handler, and deliberately does not reject palette background `inert` or `aria-hidden`. Embedded detail views without this provider cannot register a target.
- **Lifecycle and fresh execution.** `shell/task-detail-commands.tsx:70-82,96-140` rechecks the action and original session after the deferred handoff. Route identity changes replace the session. Readiness loss and provider cleanup cancel activation. Action cleanup removes old handlers. No task action enters the global panel-intent queue or navigates to reopen a task.
- **Focus and regressions.** `views/detail/rail.tsx:32-57,115-124,150-159,249-263` shares keyboard focus and visible-trigger return between the existing controls. `components/ui/dropdown-menu.tsx:122` forwards close autofocus to the compact drawer. The original single-letter guard implementation is unchanged. Rendered tests cover the blocked-work confirmation, both layouts, focused list/board rejection, hidden and ambiguous sessions, stale task execution and deferred-activation cancellation.
- **Security.** No observed new security issue. The change adds no backend path, dependency, persisted setting or default binding. Command context does not supply a task identity. Existing property persistence and blocked-work confirmation remain the mutation paths.

## Maintainability verdict

The session abstraction earns its place. Its 140 lines contain target resolution, registration cleanup and cancellable UI activation behind a small interface. Property owners supply handlers without moving persistence into the bridge. The global command bridge remains separate. There is no observed spaghetti growth, unjustified pass-through layer or clear scope-safe restructuring that would materially simplify this implementation. No changed file crosses 1,000 lines. The shell is 232 lines, detail view 682 and property controls 528.

The **Minimize Reader Load** principle shaped this decision. I traced target identity, readiness, handler ownership and cleanup through the new module before judging whether it adds unnecessary indirection. Central ownership of those checks reduces the state each caller must hold.

I reviewed the single new explanatory source comment directly because further delegation was prohibited. Keep `shell/task-detail-commands.tsx:75`. It explains the non-obvious Radix close-autofocus reason for two frames. It is not phase narration. The browser fixture and recorded failed iterations support the need for a handoff, but do not prove installed-host timing.

## Verification

Independently executed checks:

| Check                                                                                                                                                                          | Result                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `shasum -a 256 -c /Users/koen/.bb/thread-storage/thr_sjpzswhn4c/bbp44-evidence/review-evidence.sha256`                                                                         | All 33 hashes matched, including generated bundles, logs, plan, screenshots and traces. |
| `bun run --cwd bb-plugin-tasks-plus test shell/task-detail-commands.test.tsx shell/commands.test.tsx views/detail/keyboard.test.tsx views/detail/rail.test.tsx --maxWorkers=2` | 47 tests passed in 4 files.                                                             |
| `bun run --cwd bb-plugin-tasks-plus typecheck`                                                                                                                                 | Passed with pinned TypeScript 7.                                                        |
| `bun run --cwd bb-plugin-tasks-plus lint`                                                                                                                                      | Passed. Four warnings are in unchanged files or unchanged code outside this diff.       |
| `git diff --no-ext-diff --no-color --check e9afeecce2d0b4675f3879bd04d2a5cd40af30fa`                                                                                           | Passed.                                                                                 |

I inspected the hash-verified full-test log with 1,475 passing tests in 130 files, full browser log with 34 passes, SDK check, build and strict OpenSpec validation evidence. I also inspected wide and narrow status-menu screenshots and the nine-ID/no-comment bundle assertion artifact. These are reviewed implementation evidence, not checks rerun by this reviewer. Trace archives were hash-checked, not replayed. I did not rerun a browser suite or activate a plugin.

## Exact limits and residual risks

- Installed BB palette ordering, retained-panel visibility and assigned shortcut behavior remain unverified. The simulated host palette cannot establish these. Task 1.7 correctly stays open.
- No installation, activation, live plugin reload, production task mutation or Settings binding check was performed. Reload coverage is a rendered unmount/remount only.
- CI has not run and no PR exists at the reviewed point, as reported in the task context.
- This is source-review approval for delivery 1, not completed installed acceptance or approval of later deliveries.

Throughput checkpoint is n/a for this read-only review. No source, settings, Git refs, evidence inputs or generated bundles were edited. Only this requested report was written. No files were staged.
