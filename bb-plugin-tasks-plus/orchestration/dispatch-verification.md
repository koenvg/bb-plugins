# Safe dispatch verification

## Public contract checks

The tests use disposable SDK hosts, isolated SQLite stores, registered CLI/RPC builders and native hook contexts. They cover concurrent same-task requests, ordinary retries, a unique claim across stores/runs, legacy candidate adoption, prior work, missing/failed/deleted/stopped owners, local rollback, pre-attachment activity, unknown creation, reopened blockers, absent handoffs, paused/reloaded runs, changed project/scope/preset/provider facts, mixed queued groups, detached queued owners, execution ceilings and unchanged legacy warnings. The complete package checks and single completion review are recorded in the BBP-36 task report.

Red checkpoints include the missing dispatch contract, misleading pre-attachment seed text, native default-tier rejection, detached queued-owner admission and changed unverified provider/version paths. Each regression passed after its fix. No test mutates TENET-30, BBP-8, live Tasks data or prerequisite environments.

## Completion review resolution

One fresh-context read-only review covered the complete cumulative diff from `e06bfb1`, including all untracked files. It found three plugin-local defects. All three have fixes and regression checks:

- Adoption now refuses a thread with any existing live orchestration claim. Bounded plural lookup detects historical ambiguity before sender classification. Other runs cannot retag or reuse the original owner as their own. Delayed sends from all recorded coordinators for the original epic are checked, including a historical coordinator after a third run starts. Manual multi-attachment is unchanged.
- Native observation now ends before one synchronous Tasks admission transaction. Tests hold interruption-history reads pending, then pause, reopen a blocker, detach the owner, change the preset or reject the claim. Every case refuses the original turn and preserves identity.
- Compact status maps handoff readiness to its strict `state`/`reason` object. Dispatch references remain separate. A composed controller/dispatcher/status test accepts a reader with report references without claiming stored reports or acceptance.

The first review regression checkpoint had 11 failures and one passing detachment check. A further red check caught historical-coordinator classification. The final checks pass with 123 focused tests and 687 full tests, plus typecheck, lint and build. Lint has only five existing warnings. Build retains the existing SDK pin warning. No second review ran. The task report contains the original review and the fix disposition.

The installed checkpoint below predates these review fixes. Their additional evidence uses isolated production-module fixtures and the final package build, not a new installed provider execution.

## Installed native checkpoint

On 2026-10-03, a local `tasks36-admission-fixture` plugin registered only `bb tasks36-fixture`. Its tracker database was separate from live Tasks. It copied the source dispatcher and used an explicit fixture run controller, not a user-authorization claim. A test-only native wait gate prevented all provider execution. The production dispatcher has no such gate or explicit queue drain.

On BB 0.44.0 with installed/build SDK 0.5.29, BB created one pending child, `thr_7mjg4bkciz`, parented to `thr_6jfk59eygj`. The source dispatcher attached it under claim `279fa02d-ac18-48e5-83b7-7f6bb92058e6`. Its original queue row was `qmsg_icwhjheai9`. Native creation metadata had task/attempt/run/parent/project correlation before attachment. The queue retained plugin origin and a null sender. Native environment intent resolved through the existing `git-worktree` provider on the existing host, with the default branch. No environment or agent execution began.

One explicit fixture command paused the fixture run and asked BB to recheck the existing row. The source hook rejected admission as paused. BB kept the same pending child and failed queue row. The durable claim became `admission_rejected`; the source retry returned `resolution_needed` with the same child and claim. Reload and retry of the source from that checkpoint did not create another child.

Pi requires `full` permission mode on this BB version. Initial separate fixture tasks using `auto` failed before any observed child. Their claims remained `creation_unknown`; they were not released or retried as replacement workers. The positive queue check used Pi's existing supported full-permission mode and high reasoning, while the fixture gate refused provider execution. Production code never raises a selected permission mode to satisfy Pi.

The native queue resolved an unspecified service tier to `default`. A public hook regression first reproduced the resulting incorrect refusal, then verified that null/default equivalence works without accepting an unapproved fast tier. Native paused rejection was verified directly; the final tier comparison's positive execution path was checked in the public hook fixture, not by starting a provider.

The installed probe first failed because source imports left the fixture package. The source was copied inside that package before testing. Its first adapter also omitted awaits on asynchronous KV reads, so no dispatch identity reached creation. Those fixture failures and their corrections are preserved in the evidence. No duplicate `bb tasks` registration occurred.

## Limits and cleanup

This checkpoint verifies native creation, queues, parent/correlation fields, delayed hook rejection, retained worker identity and safe source retry. It is not end-to-end run activation or repository acceptance. Lost responses and pre-attachment activity use failure-injection fixtures, not an installed network-loss claim. Selected-skill translation evidence remains BBP-35's SDK/native path evidence, not picker-click evidence. No installed UI screenshot is claimed.

Only Pi on exact BB 0.44.0 has a verified coordinator path. BBP-35's actual native invocation and durable approval evidence remains the authority prerequisite. BB-recorded user/null attribution is not proof of an actual human. BBP-51 tracks that accepted temporary limit. Other providers/versions fail closed. BB's explicit user Send-now can bypass plugin hooks, and disabled plugins cannot enforce admission. This slice uses neither override nor capacity-limit changes.

Before removing the fixture, its raw tracker snapshot, source, queue and hook evidence were saved. Cleanup stopped and archived only the identified disposable child, deleted its failed queue row through the public SDK, and confirmed zero queue rows and zero pending interactions. Native thread history stays archived as evidence. After durable evidence attachment, cleanup removed the fixture plugin from the registry and deleted its temporary source and storage. The final task report records removal checks. Live `bb tasks show BBP-36` continued to resolve only the implementation owner thread. The accepted user task status/association updates are the only live tracker writes.

Required prerequisite handoffs remain unknown until the report slice supplies authoritative Tasks-owned state. Integration role dispatch and epic acceptance remain separate later work. Original claims keep their run binding; this slice has no operator release/replacement/reconciliation command, automatic resume, scheduler or polling loop.
