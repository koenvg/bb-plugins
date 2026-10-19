# BBP-47 independent review

## Verdict

Approve for code and fixture scope. No actionable correctness or maintainability findings were established.

Installed BB acceptance remains unverified. This verdict does not authorize merge, deployment, settings changes or actual worker delegation. Delivery 4 checkboxes correctly remain open.

## Target and method

- Repository `/Users/koen/.bb/plugins/environment-git-worktree/host-data/worktrees/thr_r9wjv6p6vp-1/bb-plugins`.
- Fixed point `bf56f787e839d68e610b3917aaf651040e91e552`.
- Working-tree scope includes tracked changes, both untracked source files, verification media/report, the private Playwright config and enumerated ignored build artifacts.
- Used `git diff --no-ext-diff --no-color bf56f787e839d68e610b3917aaf651040e91e552` and `git status --short --branch --untracked-files=all`.
- Applied the strict `review` skill selected through `code-review`. Live action availability changes the command contract. Control readiness and focus ownership cross the registry, TaskDetail, both layouts and DispatchControl.
- Read the governing instructions, verification skill and Tasks feature map, delivery 4.1 through 4.4, design, specification, shared plan, implementation notes and original verification report.
- Read-only source review. No nested delegation, source edits, commits, settings changes, activation or actual delegation. Only this new external report was written.

Throughput checkpoint is not applicable to this read-only investigation.

## Findings

None. No concrete cleanup candidate warrants a follow-up ticket from this review.

The following conclusions come from tracing production code, not just accepting passing tests.

- `views/detail/index.tsx:322-360` stores readiness as `Record<PropertiesLayout, boolean>`. Distinct stable callbacks prevent the hidden duplicate from overwriting shown-control readiness. Availability and opening both resolve the current layout from geometry, without requiring a resize render. This preserves the intentional independent local controls and does not introduce a task-global worker lock.
- `shell/task-detail-commands.tsx:50-90` evaluates the live action predicate during listing, invocation and deferred activation. Its existing session identity and readiness cleanup cancel stale opening after task changes or unmounts. Dispatch uses that same guarded opener through `d`.
- `views/detail/index.tsx:498-499,603-604` excludes loading and failed preset snapshots, including retained data from earlier successful loads. `views/detail/threads.tsx:160-199` requires a current preset and keeps confirmation and delegation unavailable. The synchronous busy ref closes the pre-render duplicate-selection window. The mounted check prevents an awaited confirmation from dispatching after unmount.
- `views/detail/threads.tsx:179-182,240-265` keeps selection and delegation in the existing owner. Opening invokes neither `pickPreset` nor `dispatch`. Explicit selection retains the current task/preset payload, blocked confirmation, error reporting and retry. The mouse primary button retains last-preset selection.
- `views/detail/property-menu-focus.ts` is an exact extraction of the existing helper from `rail.tsx`, now also used by dispatch. The control refs and close-focus callback point at the selected layout's trigger. No property assertions were weakened in the browser diff.

Paths above are under `bb-plugin-tasks-plus/`.

The new action union is a small extension at the canonical command boundary, not a second command framework. Readiness forwarding through the two existing layout components preserves ownership. No changed production file crosses 1,000 lines. I found no structural regression or obvious restructuring that would remove substantial complexity without widening this delivery.

## Verification performed

Independently reran the following checks.

| Check                                                                         | Result                                                                                                                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Dispatch, detail commands, static commands, keyboard and rail rendered suites | Passed. 87 tests in five files. Exit 0.                                                                                                    |
| Package pinned TypeScript 7 typecheck                                         | Passed. Exit 0.                                                                                                                            |
| `git diff --check` against the fixed point                                    | Passed.                                                                                                                                    |
| Staged-diff inspection                                                        | Empty. `git diff --cached --quiet` exited 0.                                                                                               |
| Private config new-file diff                                                  | Reviewed with the required `/dev/null` no-index command. Expected exit 1. It only extends the private-capture config with video recording. |
| Private config SHA256                                                         | Matched `57df5a592c742d27b54345ee977ae4ca4722374e3a2d829f9495e5f8bdbd85e3`.                                                                |
| `build-hashes.sha256` verification                                            | All seven enumerated build artifacts matched.                                                                                              |
| `review-artifact-hashes.sha256` verification                                  | All seven entries matched, including the original report, media and private config.                                                        |

Inspected the supplied full-test log showing 1,519 tests in 132 files, full Chromium log showing 43 passing tests and owned-origin handoff at `http://127.0.0.1:64688`, final formatting/typecheck logs, successful build log and final formatted root-check output. These are inspected parent-run evidence, not independent reruns of those complete checks. Earlier failed checks remain preserved separately.

Read the complete new 399-line rendered test file. It exercises both layouts, explicit choice and cancellation, retained-data refresh failures, busy shown versus idle hidden controls, live layout changes, invocation/deferred readiness, current-task targeting, stale-frame cancellation, blocked confirmation, failure/retry and mouse/`d` behavior. I also inspected the changed callers and browser fixture, including its substituted delegation boundary.

Inspected wide and narrow picker screenshots and the supplied video contact sheet. Both screenshots show the existing visible picker with Worker focused. Verified MP4 metadata and hashes. Direct full-motion playback was not performed. Images are supporting evidence, not proof of exactly-once delegation; literal RPC payload assertions supply that fixture evidence.

## Limits and residual risks

- The fixture palette simulates host focus restoration. It cannot establish real BB palette ordering, retained-panel behavior or personal-binding behavior in the installed host.
- Delegation is substituted at the RPC boundary. No real worker or linked-thread side effect was created or verified.
- Full package/browser suites, SDK declaration check, build, root check, strict OpenSpec and mechanical detector were not independently rerun. The parent-run evidence and stated results remain separately attributed.
- Installed source differs from this checkout. The explicit no-deployment restriction blocks exact-checkout installed acceptance and its binding checks. These are outstanding acceptance limits, not code-review findings.
- Cursor Comment Sicko, deslop and multi-model arena integrations were unavailable. No substitute nested review was launched. This report is the independent Pi review.

Model the Domain shaped the review of layout-indexed readiness instead of assuming a shared lock. Minimize Reader Load shaped the ownership and abstraction review. Prove It Works shaped the independent rendered/type checks and artifact-hash verification, while keeping fixture proof separate from installed acceptance.

The original `verification/BBP-47/report.md` was preserved. Final repository status showed the same task-owned changed and untracked paths as at review start.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Completed independent read-only review of the full specified working-tree change, private config and hashed artifacts. No actionable findings. Approve for code and fixture scope only; installed acceptance limits are explicit."
    }
  ],
  "changedFiles": [
    "/Users/koen/.bb/thread-storage/thr_r9wjv6p6vp/bbp47-evidence/independent-review.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "bun run --cwd bb-plugin-tasks-plus test shell/task-dispatch-command.test.tsx shell/task-detail-commands.test.tsx shell/commands.test.tsx views/detail/keyboard.test.tsx views/detail/rail.test.tsx --maxWorkers=2",
      "result": "passed",
      "summary": "87 tests in five files. Exit 0."
    },
    {
      "command": "bun run --cwd bb-plugin-tasks-plus typecheck",
      "result": "passed",
      "summary": "Pinned TypeScript 7 typecheck. Exit 0."
    },
    {
      "command": "git diff --check bf56f787e839d68e610b3917aaf651040e91e552",
      "result": "passed",
      "summary": "No whitespace errors."
    },
    {
      "command": "git diff --no-index --no-ext-diff --no-color -- /dev/null /Users/koen/.bb/thread-storage/thr_r9wjv6p6vp/bbp47-evidence/playwright.config.ts",
      "result": "passed",
      "summary": "Reviewed new config. Expected exit 1."
    },
    {
      "command": "shasum -a 256 -c build-hashes.sha256; shasum -a 256 -c review-artifact-hashes.sha256",
      "result": "passed",
      "summary": "Both manifests verified from the repository root using their absolute paths. All 14 entries matched. Config hash also recomputed directly."
    },
    {
      "command": "git diff --cached --quiet",
      "result": "passed",
      "summary": "No staged changes."
    }
  ],
  "validationOutput": [
    "Independent rendered checks passed 87 tests; pinned typecheck passed.",
    "Parent-run logs inspected separately for 1519 package tests and 43 Chromium fixture tests.",
    "Original report, media, private config and enumerated build hashes matched."
  ],
  "residualRisks": [
    "Installed BB palette timing, personal bindings and exact-checkout activation remain unverified under the no-deployment restriction.",
    "Delegation was verified only against substituted fixture RPCs, not real worker creation.",
    "Complete parent-run validation was inspected rather than independently repeated."
  ],
  "noStagedFiles": true,
  "diffSummary": "No repository edits. Added only this external independent review report.",
  "reviewFindings": [
    "No blockers or actionable findings. Approve for code and fixture scope only."
  ],
  "manualNotes": "Reviewed production readiness, selection, focus and lifecycle paths directly. Inspected screenshots and video contact sheet, not full-motion playback. Preserved the original report. No nested agents or installed-host actions were used."
}
```
