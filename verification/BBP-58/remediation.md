# BBP-58 approved remediation

## Result

Both approved repairs pass local validation and the independent review. BBP-252 and BBP-254 meet their source acceptance criteria. BBP-58 remains `in_review` because no fresh hosted CI covers the repaired working tree and installed/native acceptance is still separately approved. No installation, activation, publication, preferences, or behavioral live data were changed.

## Scope

The operator approved fixing BBP-254 and aligning both SDK pins after the initial verification report. Installation, activation, persistent preferences, publication, and behavioral live records remain excluded. This report supersedes the initial report only for the approved repairs and new checks. The original review and earlier failed evidence remain unchanged.

Private evidence is `/Users/koen/.bb/thread-storage/thr_225xuzb9vz/bbp58-remediation`. The runtime baseline remains `89e062561b684b61ee6e6ac1a7f2584206b5cd0a`. Existing operating-document corrections from the initial verification are retained.

## Changes

- The shared `DestinationLink` now applies `checkedDestination` to native policies and requires collected-request membership for every non-fragment link. The special `bound-source` exemption is removed. The public policy remains supported, but cannot bypass common validation or the 128-request budget. Valid local fragments do not consume the source/external budget. Seven public-interface regression cases cover the three dispatch policies, rejected encodings, external/source budgets, readable inactive labels, and legitimate confined activation.
- Both consumers pin SDK 0.6.49. The supported `bb plugin types` workflow was run on disposable manifest copies first. It proposed only that SDK change. Their package-local official CLI pins also move from BB 0.46.0 to 0.46.1, matching the current host and SDK. Both Bun lockfiles, CI's tool-version assertion, the independent-build verifier, and operating examples match those pins. No unrelated package upgrades are intended.
- SDK 0.6.49 broadens the model picker's reasoning value to a string. Tasks still accepts its existing enumerated preset schema. `savePresetDraft` validates that boundary with the existing schema before either create or update RPC. It does not widen stored values or silently coerce an unsupported choice. Two regression cases retain the no-RPC result for unsupported values. Existing valid preset-save tests remain.

The implementation keeps the existing state shapes and public source policy. It removes an exception rather than adding a policy abstraction. Source loaders, host/root checks, image authority, exact Raw, task ownership, and dialog focus/lifetime code are unchanged.

## Checkpoints

| Check                               | Observation                                                                                                      | Status                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Safety red checkpoint               | New public tests failed only the three bound-source cases before the fix; attachment/delegated cases passed      | Verified reproduction     |
| Safety green checkpoint             | New safety cases plus existing navigation cases pass, 13 tests                                                   | Passed                    |
| Preset red checkpoint               | New unsupported-reasoning cases failed before boundary validation                                                | Verified reproduction     |
| Preset green checkpoint             | Focused preset suite passes after using the existing schema                                                      | Passed                    |
| Current-host SDK checks             | Both `bb plugin types ... --check` commands exit 0                                                               | Passed                    |
| Typechecks                          | Shared and Reader pass; initial Tasks run caught the widened picker type; Tasks passes after boundary validation | Passed after recorded fix |
| Frozen setup                        | Both consumer frozen-lockfile installs exit 0 after lockfile generation                                          | Passed                    |
| Complete package suites             | Shared 117, Reader 235, Tasks 1,326 tests pass with `--maxWorkers=1`                                             | Passed                    |
| Types, lint, formatting, SDK, setup | All three typechecks, affected lint/format, both current-host SDK checks and root setup checks exit 0            | Passed                    |
| Owned browser suites                | Reader 69 and Tasks 28 pass; no historical capture changes; owned Tasks listener is gone                         | Passed, fixture-only      |
| Matched-consumer parity             | Complete matched-width light/dark comparison and dense Raw regression pass                                       | Passed, fixture-only      |
| Independent clean builds            | Fresh source copies with opposite consumer and shared dist absent                                                | Passed, all 19 checks     |
| Fresh protected-change review       | Approves source changes with no blockers; R1/R2 and SDK alignment accepted                                       | Passed                    |
| Hosted CI for repaired source       | No new committed/pushed revision or hosted run exists                                                            | Not run                   |
| Installed/native acceptance         | No approval for installation or live data                                                                        | Blocked                   |

Logs include `safety-red.log`, `safety-green.log`, `preset-red.log`, `preset-green.log`, `reader-sdk-after.log`, `tasks-sdk-after.log`, `tasks-types.log`, and `tasks-types-after.log`. The earlier failing typecheck remains evidence, not a pass.

Final package/build evidence is in `check-exits.txt`, `clean-build/checks.json`, `clean-build/inputs.json`, and both `clean-build/*-artifacts.json` manifests. The independent verifier checks emitted ESM, compiled common JS/CSS, absence of a runtime shared-package import or second React markers, opposite-consumer absence, and missing shared dist at consumer build time. Both package-local SDK checks use BB 0.46.1 / SDK 0.6.49.

Browser evidence is in `browser-exits.txt`, `reader-browser/results.json`, `tasks-results.json`, and `parity/`. Reader and Tasks suites have 69 and 28 passes respectively. All historical BBP-53 capture hashes are unchanged. The owner inspected the repaired-source compact/dark overlay code-focus capture and desktop/light Reader capture. Controls and local wide-content focus remain readable. The complete layout/theme/action matrices pass; these are still fixture observations, not installed acceptance.

## Independent review closure

The [protected-change review](remediation-review.md) approves the source changes with no required fixes. It confirms R1 and R2 are closed, independently repeats 16 public-interface safety cases, verifies both current-host SDK checks, and matches the source, packaged artifacts, and historical captures. The repository copy has only formatting changes. The frozen [original follow-up review](file:///Users/koen/.bb/thread-storage/thr_225xuzb9vz/bbp58-remediation/independent-review.md) has SHA-256 `d4ba645034c3f76d6be17900becebd9be523afbddcbdc91462ede520b1395d27`. The original whole-feature review also remains unchanged.

The owner inspected the exact fix and checked the completed affected runs before accepting these closures. No additional implementation or test rerun was needed after review. The initial default-worker failure remains BBP-253; the renewed complete pass uses the unchanged CI-style serial command. That separate issue is not claimed fixed.

Final state checks show the installed sources and enabled selections unchanged, both owned runners gone, no Tasks fixture listener, and all source hashes matching the reviewed code. Strict OpenSpec validation passed. Evidence is `installed-before.json`, `installed-after.json`, `processes-after.txt`, `source-hashes-final.log`, and `openspec.log` in the private evidence directory. No live verification records need cleanup. Development artifacts and evidence remain intentionally retained.

## Ownership and remaining limits

BBP-252 and BBP-254 were read, confirmed unblocked, and attached to this same thread before their approved implementation. Task-to-thread links remain. No unrelated worker, notification, or cleanup was dispatched.

Prove It Works shaped the red/green public-interface checks and the separate current-host versus independent-build SDK checks. A fixture pass is not installed acceptance. Current running plugins still use their existing source checkout, not this worktree.
