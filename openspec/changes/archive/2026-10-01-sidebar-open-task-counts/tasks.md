# Tasks

Run the commands below from `bb-plugin-tasks-plus/`.

## 1. Correct the summary count

- [x] 1.1 Change the existing mixed-status regression in `api/api.test.ts` to expect `taskCount: 1` while retaining `activeAgentCount: 1` and the separate `openTaskCount: 2`. Verify it fails for the old aggregate, then update only the task-count aggregate in `api/index.ts` to count distinct unfinished task IDs. Verify `npm test -- api/api.test.ts` passes without changing the task join, activity aggregate, or RPC response shape.
- [x] 1.2 Add focused API regressions for all six statuses, multiple projects, empty and finished-only projects, subtasks under unfinished and finished parents, multiple threads on one task, and active threads on both done and canceled tasks. Verify `npm test -- api/api.test.ts` confirms correct counts, distinct counting, retained zero rows, and unchanged activity counts.

## 2. Verify sidebar behavior

- [x] 2.1 Extend `shell/shell.test.tsx` to assert project badges, their All tasks sum, visible zero counts, and unchanged Active counts and green indicators. Include navigation and view cases showing finished tasks remain accessible and badge totals do not follow list filters or folder collapse state. Verify `npm test -- shell/shell.test.tsx` passes without adding frontend task filtering.
- [x] 2.2 Add regression coverage for completing, canceling, and reopening a top-level task. Verify API summaries return the new counts after each transition and a shell test using the existing `tasks:changed` event updates both project and All tasks badges without a page reload. Run `npm test -- api/api.test.ts shell/shell.test.tsx`.

## 3. Integration checks

- [x] 3.1 Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. Record results and any pre-existing failures separately. Inspect the final diff to confirm there are no changes to task visibility, navigation destinations, Active eligibility, agent-activity aggregation, project-deletion checks, dependencies, or database schema.

## Verification notes

- Base commit for the completion review: `6f0abf5cdbde6025b24f1d8f6600e591f76ca9b5`.
- Installed the existing locked dependencies with `npm ci`.
- Confirmed the updated regression failed on the old aggregate, returning `3` instead of `1`, then passed with the query change.
- Focused API and shell tests: 67 passed.
- Full suite: 475 tests passed across 45 files.
- Typecheck and build passed. Build reported the existing SDK version difference, plugin `0.5.9` versus host `0.5.29`; no dependency change was made.
- Lint passed using a temporary tool: `npm exec --yes --package=oxlint -- npm run lint`. It reported four warnings on unchanged code. No package manifest or lockfile was changed.
- `git diff --check` passed. The only production change is the conditional task-count aggregate; task joins, activity counting, frontend code, contracts, and schema are unchanged.
- Fresh-context completion review approved the full change with no actionable findings or blockers. Review run: `89c30b4b-eef4-4574-92c0-aae4f23c217c`.
- No visual UI smoke test was performed; UI behavior was verified through the shell test suite.
- Deployed the three changed files to the existing local installation at `/Users/koen/.bb/local-plugins/tasks-plus`, preserving its separate task-row layout fix. Re-ran all 67 focused tests there, rebuilt, and successfully reloaded `tasks-plus`.
- Live RPC verification after reload matched every project summary against unfinished top-level tasks returned by `listTasks`. At verification time, the All tasks total was `29` out of `54` top-level tasks.
