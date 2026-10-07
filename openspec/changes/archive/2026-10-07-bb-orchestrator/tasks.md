# Implementation checklist

## Superseded

Superseded by [remove-bb-orchestrator](../remove-bb-orchestrator/tasks.md).
This checklist is historical. Any unfinished acceptance or backlog work below
is withdrawn, not completed. Do not resume this change or synchronize its
positive capability deltas. This note does not change external tracker tasks.

## Approved release boundary

The BBP-33 manual-first contract supersedes automatic coordination for this release. BBP-39/40/41 are deferred top-level backlog, not completed. Historical activation/dispatch tests are evidence, not acceptance of removed automation. BBP-51 remains the known native user-classification limit.

## Retained implementation

- [x] Bundle the manual-only bb-orchestrator skill with scope-record controls and compact status, without substitute ordinary Tasks/thread automation.
- [x] Retain native-approved scope records, bounded selection/fingerprints, explicit pause/resume, persisted request/decision identities and interrupted views after reload.
- [x] Retain compact status with independent task/worker/native readiness, owner/claim history, bounded outcomes/results/questions/delivery and unknown/stale/omitted information.
- [x] Add migration-10 reports/private contexts and preserve earlier private receipt intents without another migration or destructive upgrade.
- [x] Store all five bounded report outcomes and linked non-notifying comments atomically; retain immutable provenance, conflict rejection and stable native/capability/CLI/RPC retries.
- [x] Cut production orchestrator dispatch/adoption before execution/claim effects. New reports suppress delivery without send/spawn/queue/recheck or receipt creation.
- [x] Keep ordinary Tasks delegation, manual attachment, comment --notify and non-notifying Unblocked behavior separate.
- [ ] Integrate BBP-37 bookkeeping recovery, original-child attachment and live/released history lookup, plus BBP-86 canonical UI consumers. Owned by BBP-42, not BBP-38.
- [ ] Verify retained UI/browser workflow and whole combined package in BBP-42. Child checks do not establish epic acceptance.

## Deferred, not delivered

- [ ] DEFERRED: orchestrator worker spawning/seeding, dispatch/reuse execution, queue retry, continuation/recheck and wakeup.
- [ ] DEFERRED: report notifications and native-parent coalescing as orchestration delivery.
- [ ] DEFERRED BBP-39: automatic recorded-answer/interaction routing.
- [ ] DEFERRED BBP-40: automated prerequisite artifact/baseline delivery.
- [ ] DEFERRED BBP-41: integration/acceptance-role worker dispatch and automated acceptance.
- [ ] DEFERRED: new live provider/full-access fixture, notice-path repair or further platform diagnosis for this release.

## BBP-38 completion gates

- [x] Production-module/public-entrypoint no-agent-input, stored-report, historical retry and ordinary Tasks regressions pass. Final focused checks: 129 tests in 19 files.
- [x] Required full tests, typecheck, lint, build/package and diff checks pass. Final full checks: 703 tests in 74 files; five existing lint warnings and the SDK-pin/build-version warning remain.
- [x] Exactly one fresh-context read-only complete-diff review from 1eee962a6a095ec7d30080c9823f28f00b5162a3 returned. Its unused delivery-framework blocker was removed; affected focused/full/static/package checks passed. No second review ran.
- [x] Fresh bounded read-only original-fixture boundary confirmed on 2026-10-05 at 10:47:22.936Z through 10:47:23.665Z. Original child idle, worker/owner queues empty, run/private guard paused, hold true and gate enabled/running; history retained. No fixture mutation/unload.
- [x] Authorized local cumulative handoff recorded by this commit with evidence/support limits; no push/PR/merge/publication.

BBP-42 must independently validate the complete combined diff, run its one completion review and deliver the final acceptance handoff. BBP-33 remains in progress until that acceptance stage. TENET-30 and BBP-8 remain read-only examples.

## Integrated recovery history

BBP-37 verified original checklist items 3.5 through 3.7 with isolated CLI/RPC/SQLite regressions and one earlier native original-child recovery checkpoint. The current release retains only bookkeeping operations, original-child attachment and live/released history. It does not restore dispatch execution. Recovery uses migration 9; stored reports use migration 10. Historical evidence and its cleanup incident remain in orchestration/recovery-verification.md. Prior BBP-34/35 status, scope and skill checks remain historical evidence; combined retained acceptance belongs to BBP-42.

## Readable approval UI history

BBP-86 verified original section 7 with isolated renderer and corrected offline browser checks. Its complete run-scope-fields.ts projection and both server/browser consumers are retained. Labels do not change bound identity, fingerprints or canonical submission. Current scope-record wording and independent combined browser acceptance belong to BBP-42. No prior native/picker UI proof is claimed.

## BBP-42 combined acceptance

- [x] Integrate BBP-38, BBP-37 and BBP-86 exactly once from 1eee962a6a095ec7d30080c9823f28f00b5162a3. Preserve the completed BBP-36 branch and both canonical UI consumers.
- [x] Keep all new orchestration agent input deferred. Register bookkeeping recovery without execution/admission/delivery callbacks. Preserve original-child and released-owner history.
- [x] Verify focused/full/static/build/package checks and isolated production approval UI/manual record behavior. See orchestration/manual-first-verification.md and task attachments for checks and limits.
- [x] Received the one read-only whole-feature review from epic baseline e06bfb1ef19a338f68bca0fc1b99bea425a6ab63. Resolved all three findings and reran affected checks without a second review.
      Local delivery, capability-free attachments, coordinator handoff, BBP-42 status and worker detachment are recorded in the BBP-42 task attachments after the source checks pass. BBP-33 status remains the parent's decision.
