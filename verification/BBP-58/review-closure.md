# BBP-58 owner review closure

## Verdict

Request changes. R1 remains open. R2 is closed by documentation changes. No runtime implementation was changed, no second reviewer was launched, and no installation is authorized by this record.

The single fresh whole-feature review used `review` because the change crosses a shared public interface, source permissions, bounded resources, lifecycle state, and two production consumers. Baseline was `f80724cec1d7ee6698557466227b1afefde073f5`; frozen feature code was `89e062561b684b61ee6e6ac1a7f2584206b5cd0a`. [The repository review copy](review.md) contains the reviewer's report with only formatting changes. The unchanged original remains in [private evidence](file:///Users/koen/.bb/thread-storage/thr_225xuzb9vz/bbp58/independent-review.md) and on BBP-254, SHA-256 `144a23982503d6724a63896f50403eb11b6079e741eb2c9d0e4e76baaa605bb3`.

## R1 remains open

The owner read `packages/markdown-document/src/destinations.tsx` and `src/destination-policy.ts`, then reproduced the reviewer's public-interface failure independently. The probe imports the actual shared source and uses React server rendering. It performs no navigation, network request, or write to source data.

| Probe                         | Observed result                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `%2e%2e/notes.md`             | Common gate rejects, model collects no request, bound-source renders an active source anchor  |
| `https://example.org/a%2fb`   | Common gate rejects, model collects no request, bound-source renders an active HTTP(S) anchor |
| `https://example.org/a%252fb` | Common gate rejects, model collects no request, bound-source renders an active HTTP(S) anchor |
| 140 unique source links       | Model collects 128 requests, bound-source renders 140 active anchors                          |

[Owner probe](file:///Users/koen/.bb/thread-storage/thr_225xuzb9vz/bbp58/destination-probe.ts) and [output](file:///Users/koen/.bb/thread-storage/thr_225xuzb9vz/bbp58/destination-probe.log) retain the reproduction. Exit 0 means the defect was reproduced, not that the safety requirement passed. Probe SHA-256 is `a44ea71fdb6ceb9055a46f3f21ac059f80fa267e15342fb358efdcdc4c22c5ef`.

New BBP-254 records this verified defect with the unchanged review, probe, and output attached. Reader uses delegated grants and Tasks uses attachment policy. No production root escape is demonstrated. The unused public path still violates the shared contract. Removing it or applying the canonical gate/budget requires runtime-code repair beyond this verification-only run. That repair and its regressions remain unimplemented pending approval.

## R2 is closed

The owner inspected the README command and the test's fixed-path capture branch. The unsafe bare `bun run test:browser` checklist entry was replaced with a fresh evidence directory, `BBP53_CAPTURE_PHASE=none`, the maintained private capture configuration, traces, and private output.

The full protected suite already passed all 28 cases with those settings. After the documentation change, the exact relative configuration from the README listed all 28 tests successfully with `--list`. No unsafe historical-capture command was executed. Historical before/after manifests remain identical. Evidence is `tasks-browser-retry.log`, `readme-command-list.log`, and `historical-retry-after.txt` in private evidence. Final documentation formatting and diff checks are recorded in the main report.

The adjacent stale BB/SDK target was corrected to match the manifest. Existing BBP-234 already records prerequisite-document drift; no duplicate cleanup issue was created for that correction.

## Remaining validation

The unchanged complete serial Tasks suite passed 1,324 tests across 125 files, exit 0. The default-worker run's two failed embed assertions remain in BBP-253 with focused and full serial evidence. No test assertion or timeout was changed, and timing is not a proven cause.

Both isolated pinned SDK/build checks passed. Both current-host SDK checks failed on SDK 0.6.37 versus 0.6.49, already recorded in BBP-252. SDK alignment, installed build identity, native behavior, and live records are not accepted by fixture results. R1 and current-host compatibility prevent acceptance; no OpenSpec delivery-6 completion boxes were changed.
