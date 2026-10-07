# BBP-64 independent completion review

Source merge verdict: approve for integration. I found no blocking source defect or structural regression. BBP-64 completion remains blocked on the required installed paired benchmark and native/compact host checks. This review does not authorize activation.

## Scope

Reviewed the complete working-tree change against `da0946e9732218d3343aa041a0ea54797196c027`, which is also HEAD. This includes all eight modified tracked files and all three untracked files from `git status --short --branch --untracked-files=all`.

Read the global review skill, applicable global instructions and code-change workflow, the performance spec, design section 4, both changed rule documents, all changed tests, and the BBP-64 report. Inspected the adjacent list, detail, session and route boundaries. No repository files, commits, task records or installed sources were changed. No files are staged.

## Findings

No source blockers. No actionable cleanup candidate found.

- Queue policy stays in the existing session preview module. `task-previews.ts` separates the request map, which controls sharing/publication, from the speculative set, which holds slots until old transports finish. `warm` replaces a bounded queue; foreground `load` does not wait for a slot. Request identity and epoch checks prevent invalidated responses from becoming current. Disposal guards both publication and pumping.
- The workspace uses the list's reported rendered order, not a second sort/filter model. `task-data.tsx` requires a current positive selected response before warming the immediate neighbors. `browse-workspace.tsx` clears queued work on accepted context changes and order reports, and checks scope before warming. Scope-keyed workspace lifetime also clears old queued work on unmount.
- Neighbor warming calls only the existing basic `getTaskByKey` binding. It does not mount neighbor detail views or call navigation, save, activity, attachment, thread or PR actions. Existing keyed detail/edit ownership and save barriers remain intact.
- The change does not introduce a generic cache, new dependency or scattered detail-mode checks. The three changed production files remain 230, 256 and 355 lines. No file crosses the review skill's 1,000-line limit.

## Evidence personally verified

1. `npm --prefix bb-plugin-tasks-plus test -- --maxWorkers=2 --no-cache shell/task-prefetch.test.ts shell/browse-prefetch.test.tsx shell/task-previews.test.ts shell/browse-preview.test.tsx shell/browse-preview-safety.test.tsx shell/task-data.test.tsx shell/task-inventory.test.ts`
   - Passed: 7 files, 50 tests.
   - Includes the final first-visit warm-detail assertion, bounded speculation, same-key sharing, selected-read priority, invalidation, noncancelable late disposal, rendered order changes, failed/unsettled lists, task-owned drafts, failed saves, focus and parked Ticket behavior.
2. `node --test bb-plugin-tasks-plus/scripts/navigation-benchmark/benchmark.test.mjs bb-plugin-tasks-plus/scripts/navigation-benchmark/qualification.test.mjs`
   - Passed: 19 synthetic driver/qualification tests. These are not browser performance results.
3. `git diff --check`
   - Passed.
4. Final Git status matched the initial changed/untracked file list. `git diff --cached --name-only` was empty.

## Parent-reported evidence, not independently rerun

- Full Tasks suite passed with 112 files and 1,162 tests before the final added assertion. The final full-suite rerun was pending in the review handoff.
- Typecheck, formatting, local plugin build and lint passed. Lint had four unchanged warnings.
- The parent also reported 5 focused files/43 tests and 19 synthetic benchmark tests. My runs above independently cover those areas.

## Remaining acceptance limits

The BBP-64 report explicitly records no before/after browser samples and unrun installed native/compact checks. Thus median, p95, worst time, blank intervals and long-task counts remain unknown. Passing jsdom tests does not establish the 100 ms p95 target, real layout/focus behavior or cross-plugin costs.

Before completion, obtain operator approval and coordinate with the owner of the running Tasks source. Then collect the required paired browser evidence with Tasks and quota enabled, verified source/bundle/browser/dataset identities and at least 30 qualified warm movements per side. Keep cold, invalidated and save-pending cases separate. Verify native and compact Ticket acceptance. Do not use the other thread's running source as an assumed baseline, and do not activate this candidate without approval.
