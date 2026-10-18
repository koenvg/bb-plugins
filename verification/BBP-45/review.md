# BBP-45 independent routine review

## Verdict

Approve the implementation and local fixture evidence for an open PR. No blocking defects or actionable non-blocking findings were found in the reviewed change.

This approval does not establish installed-BB acceptance, merge readiness, or deployment readiness. Installed palette ordering, retained-panel behavior in the actual host, temporary personal bindings, and actual plugin reload remain blocked by the user's no-deployment and no-settings restrictions. Delivery 2 remains unaccepted and its OpenSpec checkboxes correctly remain open.

## Scope

Reviewed the complete tracked diff against `c904a7344ea639ef2a2dcb80ab0431006affa2f5` and all three untracked repository additions. Status contained seven modified files, `verification/BBP-45/report.md`, and the two fixture screenshots. No staged files were present.

Reviewed changed production code, rendered tests, browser tests, README instructions, bundled property-command instructions, and OpenSpec evidence notes. Read the delivery requirements, design and specification. Followed the relevant command registrations, shell provider, session resolution, readiness guards, menu state, responsive popover, modality tracking, fixture palette, and existing property persistence path.

Read `verification/BBP-45/report.md` without changing it. Inspected both untracked screenshots. The expected future `review.md` attachment was not treated as a defect.

The review used the requested routine-review skill. No agents were launched. The nested How and Comment Sicko workflows were not run because this role explicitly prohibits nested delegation. The supplied read-only architecture explanation was read and its hash verified.

## Findings

None. No concrete correctness, data-integrity, security, scope, or maintainability regression was identified.

## Requirement and safeguard checks

- `bb-plugin-tasks-plus/views/detail/index.tsx:323-327` registers the semantic due-date opener with the existing task session. It does not add another bridge, default binding, bare-key shortcut, navigation intent, backend path, or persistence policy.
- `bb-plugin-tasks-plus/views/detail/rail.tsx:60-71` and `:172-249` extend the existing controlled-menu model. Both layouts receive `menuProps(control, "dueDate")`. The selected layout owns the open picker, and the existing focus helper enters its date input and restores its connected, visible trigger for keyboard dismissal.
- `DueDateMenu.pick` still calls the same property update callback. Presets save local calendar dates, a nonempty native date change saves immediately, removal sends `null`, and empty input does not remove the date. Opening and Escape do not call the update callback. No new Save policy was introduced.
- `bb-plugin-tasks-plus/shell/task-detail-commands.tsx:33-83` remains unchanged. It requires exactly one shown, loaded matching session and handler, resolves again after the two-frame handoff, and rejects stale sessions. Provider and readiness cleanup cancel deferred activation. Due date now uses these same guards.
- The existing `TaskDetail.updateTask` and `createTaskEditSession` retain the task-ID-bound staged/flush path, serialized writes, and failed-draft retry behavior. The command does not bypass those safeguards.
- `bb-plugin-tasks-plus/shell/task-detail-commands.test.tsx` adds due date to shared eligibility coverage. Added cases assert exact payloads for all presets, custom selection and removal, ignored empty input, opening/Escape silence, one visible picker, mouse selection, fresh task targeting, persisted fixture rereads, and route/unmount/hidden cancellation before either deferred activation frame.
- `bb-plugin-tasks-plus/tests/browser/task-commands.spec.ts:15-97` drives the rendered command with real keyboard input at 1200 and 650 pixels. It checks exact update arrays, date-input focus, preset selection, native ArrowUp custom selection, bounded Tab traversal to removal, Escape return, fresh targeting, and unavailable listing routes. The DOM evaluation observes focus only. No forced focus or private setter supplies passing behavior. Pinning en-GB makes the tested native date segment deterministic without changing production behavior.
- README and bundled property-command documentation match the rendered choices and immediate nonempty date-selection save. Deferred commands remain documented as unavailable. The OpenSpec evidence note does not claim installed acceptance.

## Independently verified

Ran the requested fixed-point diff and working-tree status commands. Used the required no-index diffs for all three untracked additions, with exit 1 expected for new files. `git diff --check c904a7344ea639ef2a2dcb80ab0431006affa2f5` passed. A final status check showed the same repository scope, and `git diff --cached --quiet` confirmed no staged changes.

Recomputed the private evidence manifest hash. It matched `6742835aaefdc75275496c9ee4f9b20178802cdf77084ecdcaf7666f76eebe58`. `shasum -a 256 -c` verified all 313 listed evidence files with no failures. This attestation covers the pre-review evidence, not this newly added review artifact.

Recomputed the architecture artifact hash. It matched `7974b942998361f8f25c4e411106ea6611348e45e33f86b22e3fd5538347f68b`. Verified all four entries in `build-hashes.sha256`, covering both changed production inputs and the built `dist/app.js` and `dist/app.css`. Historical BBP-53 before/final capture manifests were byte-identical.

Read retained validation outputs rather than rerunning package, build, or browser commands in this read-only role:

| Evidence                                | Observed result                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `package-tests-final.log`               | 1,487 tests in 130 files passed.                                                            |
| `focused-final.log`                     | 51 rendered command, rail and keyboard tests in three files passed.                         |
| `package-typecheck-final.log`           | Pinned TypeScript command completed without diagnostics.                                    |
| `package-lint-final.log`                | Four warnings, all in unchanged files. No reported errors.                                  |
| `package-format-final-2.log`            | All matched files correctly formatted.                                                      |
| `root-check-final.log`                  | Eight setup tests, 29 lifecycle tests, lint and formatting completed successfully.          |
| `sdk-types.log`, `plugin-build.log`     | SDK pin/host match and official plugin build outputs retained.                              |
| Markdown build/test/typecheck logs      | Build and typecheck without errors, 132 tests passed.                                       |
| `browser-final-2.log`, `.last-run.json` | 36 tests passed at the owned loopback origin, no failed tests. Both due-date widths passed. |
| `openspec.log`, `design-detector.json`  | Strict change validation valid, detector findings empty.                                    |

Reviewed the retained browser removal failure and missing-dependency lifecycle failure. Their outputs agree with the failure history in the report. The final browser test still asserts focused removal and exact writes after actual Tab traversal. It does not drop the failed assertion. The final separate run passed. The root final log establishes recovery from the missing fixture dependencies.

The two repository screenshots show the initial focused native date input with synthetic task data. The wide image shows the rail popover, and the narrow image shows the responsive sheet. They support layout and focus inspection, not live host acceptance.

## Verification limits and residual risks

- No installed host interaction, personal binding, source switch, activation, settings change, actual reload, production mutation, credential access, commit, or deployment was performed by this reviewer.
- Test and build results above are retained execution evidence supplied by the parent, independently inspected and integrity-checked. They were not rerun by this reviewer. Trace archives were hash-verified, not replayed interactively.
- Simulated palette timing and rendered remounts cannot prove actual installed-host ordering or plugin reload. Those acceptance gates remain blocked, not passed.
- Native date entry intentionally retains immediate save on a nonempty native change. The keyboard browser proof pins en-GB Chromium and does not establish every locale or operating-system date widget behavior.
- Existing lint warnings do not arise from this diff. No new dependency or shared control algorithm requires broader review.

## Principles applied

Prove It Works led to checking the actual source-to-artifact hashes and original validation outputs instead of relying only on the implementation summary. It also kept installed acceptance separate from fixture evidence.

Test Behavior, Not Implementation led to checking literal task-update arrays, real keyboard actions, fresh task identity, and no-write cancellation results rather than treating command registration or successful compilation as sufficient proof.
