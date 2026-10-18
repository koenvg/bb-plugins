# Independent CI repair review

## Verdict

Approve the test correction and its local validation. No blocking or non-blocking defect found in the reviewed change. This does not establish remote CI completion, installed acceptance, merge readiness, or deployment approval.

The repair preserves the exact July 17 result and keyboard-only custom-date coverage for users. Maintainers inherit two native-calendar keys instead of an assumption about the focused native date segment.

## Scope and checks

Reviewed the complete working-tree diff against `4277fb031705f0d02a650e335a55317522a61c49`, including the untracked `verification/BBP-45/ci-follow-up.md` through the requested no-index diff. The tracked changes are only `bb-plugin-tasks-plus/tests/browser/task-commands.spec.ts` and an appended note in `verification/BBP-45/report.md`. The historical `verification/BBP-45/review.md` is unchanged. The future `ci-review.md` attachment is not a defect.

Independently verified:

- At `task-commands.spec.ts:48-49`, the sole source edit replaces ArrowUp with Alt+ArrowDown then ArrowRight. A byte-level check reconstructed the expected file from the fixed-point Git blob and compared its Git blob hash with the working file. They match. Every `expect` call, expected literal, and all other bytes remain unchanged.
- No product code, dependencies, configuration, settings, retries, skips, timeouts, alternate dates, forced focus, fill, or setters were added. `git diff --check` passes and no files are staged.
- The archived baseline spec in `source.tar` equals the fixed-point Git bytes. The current spec SHA256 is `6275ebdfecfb662e4d927e5b2e184900e198d914c5577aac901e206bcd3cfc4b`, matching the supplied host/container identity.
- The original job log shows both widths failing with expected `2026-07-17` and received `2026-08-16`, with 34 other tests passing and exit 1. `linux-baseline-browser.log` reproduces the identical mismatch at both widths, with 2 failed, 2 passed, and exit 1. `mac-baseline-browser.log` shows all four focused tests passing.
- `linux-native-segments.log` shows initial Month focus and ArrowUp producing August 16. `parent-native-segments.log` shows initial Day focus and ArrowUp producing July 17. Both report Chromium `156.0.8078.4`. In both logs Alt+ArrowDown preserves July 16 and ArrowRight produces July 17. The diagnostic script uses real keyboard input and read-only AX observations.
- `views/detail/rail.tsx:186-188,219-225` passes the native input's nonempty emitted value directly to the existing update path and closes the picker. It does not increment a date itself. This supports the diagnosis of a reproducible test assumption, not a product date-calculation bug or an unrelated flake.

The original spec requirements and delivery 2 plan require keyboard-ready custom selection, explicit saves, unchanged data on open or cancellation, and both layouts. They do not require ArrowUp on a specific segment. The unchanged test still checks exact ordered update arrays, July 17, focus return, removal, fresh-task targeting, and unavailable commands. The new interaction satisfies that scope without weakening assertions.

## Validation evidence

Read the supplied logs and diagnostic rationale. These are inspected parent/writer runs, not browser runs performed by this reviewer.

| Evidence                          | Observed result                                                          |
| --------------------------------- | ------------------------------------------------------------------------ |
| `linux-fixed-focused-browser.log` | 4 passed, both layouts                                                   |
| `mac-fixed-focused-browser.log`   | 4 passed, both layouts                                                   |
| `linux-fixed-full-browser.log`    | 36 passed                                                                |
| `mac-fixed-full-browser.log`      | 36 passed                                                                |
| `typecheck.log`                   | Pinned TypeScript 7 command, no diagnostics                              |
| `lint.log`                        | Four warnings in unchanged files, no reported errors                     |
| `mac-fixed-format-check.log`      | All matched files use the correct format                                 |
| `linux-cleanup.log`               | Full fixture cache absent and owned ports 37421, 40997, and 33941 absent |

The supplied handoff attests exit 0 for the successful checks. Browser logs record the owned readiness origins and passing test summaries. The private config preserves base browser settings and zero retries. Full-run traces and screenshots are retained and included in the successful integrity check. I did not replay those traces.

Recomputed evidence integrity with `shasum -a 256 -c`. All 322 listed files pass. No missing files or hash failures were reported.

- Manifest SHA256 is `5c104b7ec5b8347532b9b99317c0d407d8f1f556ac1fdb2b48d2659d451f9801`.
- Original downloaded CI log SHA256 is `c267d11254a0b73610216605d9d0d1c3982176d520f992846404be90710da12a`.

Both match the review inputs. This new review report is not part of that earlier manifest.

## Limits and remaining gates

- Parent must push the reviewed correction and observe every PR check green on the resulting head SHA. No remote status was checked or declared green in this review.
- The local Linux reproduction is ARM64 with Node 24.15.0. The original CI log reports x64 Node 24.21.0. The matching failure and corrected local passes support the repair, but do not replace remote verification.
- Coverage now uses the native calendar rather than ArrowUp on the segmented editor. Native Chromium keyboard behavior remains a dependency. The exact assertions will expose a future incompatible change rather than tolerate it.
- Installed-BB timing and personal-binding acceptance remain blocked by the existing no-deployment and no-settings restrictions. Fixture success is not installed acceptance.
- Container removal, no published host ports, and macOS listener/cache cleanup are parent-attested. I inspected the retained Linux cleanup log but did not inspect live Docker state or rerun setup, containers, browsers, or package checks.

No nested delegation, source edits, historical-artifact edits, settings changes, secrets access, production mutations, staging, commits, pushes, merges, or deployments were performed by this reviewer. Only this requested external report was created.

## Review method

Used routine-review for this localized test-only correction. Prove It Works led to independent byte and hash checks. Fix Root Causes led to comparing the original failure with native AX focus and production persistence. Test Behavior, Not Implementation led to retaining the exact keyboard-driven update assertions. The applicable leaf skills were read. Nested how and Comment Sicko delegation was omitted under the explicit no-nested-delegation restriction. No source comments changed.

Throughput checkpoint is n/a for this read-only review.
