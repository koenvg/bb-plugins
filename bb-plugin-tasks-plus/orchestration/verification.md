# BBP-35 installed-path evidence

This is run-control evidence, not whole-epic acceptance. BBP-36 still owns dispatch/adoption/reconciliation and status-reader integration. No implementation worker was created, sent a message, stopped or restarted by run controls.

## Versions and fixture

- BB 0.44.0; bundled `provider-pi` 0.1.0; Pi agent release 1.0.0.
- Tasks-plus source 0.1.2; declared SDK dependency 0.5.9. BB build stamps and installed runtime use SDK 0.5.29.
- Installed copy `tasks-orchestrator-fixture`, CLI namespace `tasks-fixture`, root `/tmp/bb-plugin-tasks-orchestrator-fixture`, isolated tracker storage at `~/.bb/plugins/tasks-orchestrator-fixture/data.db`.
- One known fixture thread `thr_4msh54iqm5`, provider session `pi_ff56536c-05b8-434d-a6a5-69cde24d4937`. Initial queued message `qmsg_h3amcf2cex` waited at the host limit of 10/10. Native waits kept the same identity. No capacity change, send-now bypass or replacement fixture.
- Existing fixture epic ORF-1 and subtask ORF-2; preset `01M40TZ9HBDV4KH058G0XCW7P0`; baseline `commit:e06bfb1ef19a338f68bca0fc1b99bea425a6ab63`.

The test copy uses production bundles with a fixture namespace and a fixture-only selected-input probe. A fixture-only CLI probe calls the installed public `threads.send` SDK with structured selected-skill input and the known fixture as both target and sender. It permits only pause/resume of an explicitly supplied run ID. This probe is not shipped in Tasks-plus. It tests Pi translation, not a BB picker click.

## Verified paths

| Path | Recorded evidence | Result |
| --- | --- | --- |
| Install/enable, skill discovery, ordinary first turn | Exported skill capability; ordinary request `creq_eftni2cw5k`; isolated storage contained zero runs and requests | No orchestration |
| Exact native `/skill:bb-orchestrator` with a missing baseline | Request `creq_psyq34nd4k`, event sequence 58; native form `pint_rwqafnmarx`; public `orchestratePreview` supplies the complete selection | One submitted native decision created one run |
| Native decision persistence | Resolved lifecycle `evt_r69ccuh8kv`, sequence 83, matching invocation/decision UUID and submitted proposal | Run `6d99655a-281c-4c79-921e-9399063f21b9`, active |
| Selected `/bb-orchestrator` pause | Request `creq_a63npczyhu`, sequence 84, one source=skill mention at offsets 0..16; actual Pi executed the fixture pause command | Same run, paused; no approval form |
| Selected `$bb-orchestrator` resume | Request `creq_2iadehsg9d`, sequence 110; native form `pint_tkf4jvdnny`; resolved lifecycle `evt_29mmx5nsra`, sequence 133 | Same run, active with a new approval reference |
| Identical completed request retry | Repeated public resume RPC with the same request ID | Identical result, one run and zero pending forms |
| Plugin reload | Replayed begin request through the new controller; compared stored payload before/after | Returned interrupted; stored active record unchanged; no automatic resume |
| Observed cross-thread native text | BB recorded initiator=agent, sender=`thr_ibnafuu3tv` | `invocation_required`; no new form/run |
| Quoted ordinary discussion | BB recorded user/null, but no exact leading invocation | `invocation_required`; one existing run, zero pending forms |

The positive fixture deliberately uses the accepted BBP-51 limitation: a same-thread agent send becomes BB-recorded user/null. Native form responses use BB's public interaction response command. These checks prove the declared BB-recorded input/decision contract, not that a human selected a skill or answered a form. No other provider/version has installed positive support evidence. The runtime rejects non-Pi or non-0.44.0 activation. Negative provider cases also have public CLI harness tests.

## Defects found during validation

The first copy registered `bb tasks` and briefly shadowed the live Tasks CLI. `bb tasks show BBP-35` returned not found from the isolated tracker. The fixture was disabled, live tasks-plus reloaded, and the lookup succeeded again. Later fixture loads register only `tasks-fixture`. No live task or worker record changed. The production package keeps its existing Tasks identity.

The first native approval, request `creq_grxpb3cdx9` at sequence 19, opened `pint_3z544hqcur`. Its caller timed out after 60 seconds, and BB recorded `request-aborted` at sequence 36. This exposed a run-control defect. A red public CLI regression now covers immediate pending return. Begin/resume keep the plugin-owned native form independent of the short-lived caller. After submission, a single lookup of the same request returns its stored completion or validation error. There is no polling loop or automatic worker continuation.

CLI transport timeout or abort does not itself cancel the durable native request, discard its identity or permit a duplicate. A later valid native settlement can complete that same request/run. Downstream admission uses the durable approved run and its effective phase, not the failed CLI response. Pending and durably cancelled or failed requests grant no admission authority. Native `request-aborted` is a terminal interaction outcome, distinct from an ended CLI transport.

The isolated selected-input probe first missed required SDK send mode and had a generated-bundle brace error. Both failed before any input dispatch. Syntax checks and fixture reload corrected the probe before the successful recorded selections. These are fixture errors, not provider support claims or production code changes.

## Form and automated checks

The registered native form has frontend harness checks for missing parameters, complete proposal submission, edit invalidation, validation errors and cancellation. The complete scope and proposal remain scrollable; approval and cancellation follow them. A minimal preview at normal width and a 320-pixel card was inspected with browser-use's installed default Chromium and a fresh unsigned profile. Long fingerprints scroll inside their proposal box without hiding the buttons. This preview is not an installed native UI screenshot. Actual native pending/submitted decisions above used public BB interaction APIs.

One fresh-context read-only completion review found no blockers and one size-check issue. The fix checks the entire native form payload, including config and request identifiers, against 48 KiB before opening it. Public boundary tests accept exactly 49,152 bytes and reject 49,153 bytes with durable `approval_size_limit`, no form and no run. The oversized boundary test failed before the fix; the exact-limit test already passed. No second review was run.

Final package checks passed: 42 focused tests in four files, 616 full tests in 59 files, typecheck, lint and `bb plugin build`. Lint has five warnings in unchanged existing files. The existing workspace oxlint binary was added to PATH for the lint command. `npm pack --dry-run --json` includes the new skill and its command/support reference.

The task handoff records the single fresh-context review, final commit SHA, raw evidence attachments and fixture cleanup. No checklist item for downstream worker dispatch or whole-epic acceptance is satisfied by this slice.

## Cleanup and durable artifacts

Raw installed logs, request/result files, screenshots, fixture probe and isolated storage snapshot are in BBP-35 attachment `01M4138J0PZ34AH30SRGZ959A3`. The last native approval used `thr_4msh54iqm5:creq_8vfhihu5nm:162`, form `pint_hzsgj59vhe` and approval `thr_4msh54iqm5:evt_xht5v2r4zv:196`. Its single result lookup returned the same run as active. The post-review form-size fix has public boundary-test evidence, not an additional installed oversized-form test.

The one completion review is attachment `01M4138JF390SP0QGYYMFZJT6H`; its resolution and post-fix validation are `01M4138JRCQ61CF4154DG2VTDS`. Cleanup evidence is `01M413AYPEDMVJQ3N1KBD6AVCY`.

Cleanup stopped and archived the original fixture thread, with zero queued messages and zero pending interactions. The isolated fixture plugin was disabled and removed; its temporary source and isolated data directory were removed after evidence preservation. The preview browser session, fresh Chromium profile and HTTP server were closed or removed. No preview process remains. Live `bb tasks show BBP-35` still succeeds. Cleanup changed only the disposable fixture and preview resources; it did not stop or restart implementation workers.
