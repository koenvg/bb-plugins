# Tasks

## 1. Standalone provider fork

- [ ] 1.1 Import the committed upstream `plugins/provider-pi` tree into `bb-plugin-pi-subagents-provider`, preserving the MIT notice and recording the exact commit, tracked branch, source path, versions, and watched contract paths in `UPSTREAM.json`; verify the imported tree against that revision and exclude unrelated upstream working-tree changes.
- [ ] 1.2 Replace workspace-only dependencies, private UI imports, and internal build commands with published SDK or plugin-owned equivalents; commit a reproducible lockfile and verify `npm ci`, typecheck, and `bb plugin build` from a standalone checkout without sibling BB packages.
- [ ] 1.3 Register provider `pi-subagents` as "Pi with subagents" under a non-bundled plugin identity and isolate session storage; adapt inherited provider tests and verify normal prompts, dialogs, skill discovery, model/reasoning selection, checkpoint forks, compaction, and coexistence with the bundled provider.
- [ ] 1.4 Document source provenance, local adaptations, minimum supported versions, install/rollback steps, and unchanged standalone Pi behavior; add the package to the repository README and CI matrix, and verify the documented commands and clean non-watch `npm test` job need no BB credentials.

## 2. Structured observation and reconciliation

- [ ] 2.1 Add test fixtures for supported background snapshots, foreground partial/final tool results, workflow nesting, duplicate identities, malformed versions, and truncated/omitted entries; run the tests first and verify unsupported observation cases fail before implementing the module.
- [ ] 2.2 Implement the bridge-owned observation module with stable session/run/child identity and schema/size/depth limits; verify the fixtures pass, unknown supported-version fields are ignored, and foreign or old-session input cannot update current observations.
- [ ] 2.3 Route only subagent widgets and structured tool details into observation, preserving existing dialog handling; extend the fork's injected BB extension to forward lifecycle hints and perform read-only package status reconciliation, and verify ordinary Pi still works with the subagent package absent or disabled.
- [ ] 2.4 Document the supported protocol versions, omission rules, and observation limits; verify readers can distinguish missing support, missing fields, truncated coverage, and terminal execution from inspection availability.

## 3. Native background lifecycle

- [ ] 3.1 Add bridge tests for parent-idle live work, quiet long tool calls, duplicate terminal events, widget clearing, paused/partial states, omitted runs, and terminal roots with live descendants; verify these fail against the original generic-tool translation before adding native activity.
- [ ] 3.2 Emit idempotent native background-task open/progress/terminal deltas for live async runs without double-counting workflow descendants or foreground children; verify native activity survives a main-turn boundary and clears only after authoritative settlement.
- [ ] 3.3 Verify public bridge conformance and assembled events, including the runtime idle-cleanup guard for open background work; prove tests preserve ordinary parent turn boundaries and create no BB child threads or artificial foreground keepalive turn.
- [ ] 3.4 Add and pass tests for process exit, explicit release, session replacement, resumed canonical state, and old-session replies; verify observation never relaunches a child and preserves interrupted/unknown evidence rather than inventing success.
- [ ] 3.5 Document lifecycle guarantees, explicit-stop/shutdown limits, and the distinction between background activity, foreground runtime state, and BB concurrency slots; verify the documented guarantees match the passing protocol tests and do not claim the unrun live acceptance gate has passed.

## 4. Bounded result capture

- [ ] 4.1 Add inspection tests for a known command handled without a model turn, unavailable command preflight, correlated emit-then-retract replies, stale/foreign data, fast completion, timeouts, and replacement during a pending request; verify no test creates a visible user prompt or consumes Pi's completion notification.
- [ ] 4.2 Implement the narrow active-session inspection method and bounded, rate-limited capture queue with one in-flight request per parent; verify initial detail, recent transcript windows, and terminal captures pass the tests, and inspection failure cannot keep settled execution active.
- [ ] 4.3 Declare validated observation extension state and retain bounded captures with BB thread history; verify browser-state reconstruction after reload, explicit truncation/omission markers, total payload limits, and no arbitrary filesystem-path fallback.
- [ ] 4.4 Document captured-detail freshness, budgets, task-attribution gaps, and unavailable-result states; verify the docs describe snapshots rather than promising a complete live transcript or guaranteed capture of deleted artifacts.

## 5. Read-only Subagents panel

- [ ] 5.1 Add frontend tests for empty/loading/unavailable states, single and nested child progress, selection, capture time, final output, failed inspection, and terminal-history restoration; verify the tests exercise persisted observation data rather than injected live-page responses.
- [ ] 5.2 Implement the fork's Subagents panel and child details with public thread/event reads, BB theme tokens, wrapped output, tabular durations, keyboard access, and reduced-motion behavior; verify the frontend suite passes and no launch/stop/message/steer/resume controls are exposed.
- [ ] 5.3 Document how to select the fork and view progress/results; verify the package build contains the registered panel and that the bundled provider and unrelated dialogs remain unchanged.

## 6. Read-only upstream checker

- [ ] 6.1 Add deterministic checker tests for provider changes, contract-only changes, no relevant changes, dirty local source, missing baseline, rewritten history, network/rate-limit failures, and incomplete comparison data; verify fixtures require no live credentials or upstream code execution.
- [ ] 6.2 Implement the checker against committed `UPSTREAM.json`, with complete commit/path comparison, bounded network/cache handling, silent no-change output, and explicit failed/inconclusive results; verify all tests pass and project files, Git state, baseline, dependencies, and installed settings remain byte-for-byte unchanged.
- [ ] 6.3 Add tests for the weekly automation wrapper's stable-source lookup and repeated setup ownership; verify it cannot target an expiring worktree, silently run against a missing baseline, or create duplicate schedules.
- [ ] 6.4 Document Monday 09:00 UTC as the weekly default, script-mode setup, automation run-output inspection, wrapper refresh, pause/rollback, and user-approved upstream incorporation; verify examples use explicit project scope and do not grant automatic merge or publishing authority.

## 7. Installed acceptance and automation activation

- [ ] 7.1 Run the full package test/type/build/conformance checks and the read-only SDK compatibility check against the target BB instance; verify all required local gates pass before installation and retain exact source/version/build evidence.
- [ ] 7.2 Follow the repository verification skill to obtain required installation and bounded-agent-test approvals, install only the fork, and record original/final user state; verify the observed plugin is this checkout and no bundled provider, default selection, or unrelated data changed.
- [ ] 7.3 Establish the actual BB idle-cleanup interval and run a bounded child beyond it after the parent becomes idle; verify native background activity protects the Pi session, the final result reaches and can wake that parent, and activity then clears, with a passed/failed/blocked result and evidence for each behavior.
- [ ] 7.4 Exercise failure, parallel/nested work, browser reload, captured result persistence, and resumed session reconciliation in owned fixtures; verify user-data isolation, explicit unavailable/interrupted states, and approved cleanup before recording an overall live pass.
- [ ] 7.5 After the tested fork, baseline, and checker exist in the stable server-host project source, create or reuse one project-scoped weekly BB script automation; verify its ID, resolved source, Monday 09:00 UTC next run, and read-only checker output, and report a blocker instead of enabling it when that source is not ready.
- [ ] 7.6 Record installed acceptance and automation setup evidence, tested version limits, remaining blockers, and the final plugin/automation state; verify no lifecycle-safe release claim is made unless retention/completion acceptance and required cleanup passed, and no upstream merge or push occurred.
