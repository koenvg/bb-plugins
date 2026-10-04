# Recovery verification

BBP-37 uses review baseline `1eee962a6a095ec7d30080c9823f28f00b5162a3` and epic baseline `e06bfb1ef19a338f68bca0fc1b99bea425a6ab63`. It includes the completed status, run-control and dispatch slices. Recovery adds no migration; schema remains at 9. Migration 10 belongs to the independent report slice.

## Public production-module checks

The tests load the real Tasks server and register its CLI/RPC with the public SDK test host. SQLite data is disposable. Native BB reads and failures are injected; no live Tasks records, TENET-30 or BBP-8 are test fixtures.

Checks cover active originals before local attachment, lost response, partial attachment, local rollback, original-worker precedence, restart with effective interrupted authority, unchanged paused runs, explicit linking, wrong parent/project/plugin/task/role/run/attempt, another live claim, zero/multiple/unavailable/interrupted/saturated listings, hidden and archived coverage, unavailable metadata, old creating state without lease expiry, exact recorded decisions, changed reconciliation, history preservation, selected replacement and separate later dispatch admission. Resolution does not spawn, send, resume or delete. Native transport errors are not classified as definite absence.

The single completion review found three defects. Late spawn responses could weaken an attached claim. Ordinary adoption could retag a released original. An identical replacement retry could return the old worker. The final code uses one original-child attachment operation, keeps stronger claim state on late responses, blocks live and released history at legacy adoption and replacement, and verifies the exact recorded replacement on retry. Public regressions cover both late-response branches, interrupted bookkeeping for an unchanged owner, released spawned and adopted originals, correlated candidates, and missing or changed retry identity.

The declaration/test SDK is 0.5.9. Verification uses Node 24.15.0, Vitest 4.1.11 and oxlint 1.79.0. Native build uses BB 0.44.0 with build SDK 0.5.29. The existing SDK pin warning and five existing lint warnings remain. No dependency pin or SDK source changes are part of recovery. The task's attached verification archive contains red checkpoints, final full/static/lint/build checks, the one completion review and its disposition.

## Installed native checkpoint

A disposable package registered only `bb tasks37-recovery-4ku895`; it never registered `bb tasks`. It copied production recovery modules and stored its Tasks data separately. Its run was explicitly fixture authority, paused from creation, not evidence of user activation or operator release approval. One test-only native wait hook prevented initial provider execution. Production recovery has no such gate or queue drain.

The fixture created one BB pending child `thr_smqrnswze7`, parented to implementation worker `thr_4ku895y6ke`, in BB project `proj_gjz4e6jtmg`. Plugin origin was `tasks37-recovery-fixture-4ku895`. At creation, version-1 metadata correlated task `01M41EDMZV18B47YR558BBJYDN`, run `fixture-recovery-4ku895` and claim `c447d464-8de2-45d9-8ca5-a60b3806a5f9`. The test deliberately omitted the returned child identity from local claim bookkeeping and set `creation_unknown`.

This native checkpoint ran before the completion-review fixes. The final concurrency, adoption-history and replacement-retry fixes use isolated public production-module tests. They were not rerun with live native dispatch or operator decisions.

The source CLI reconciled actual BB listings and metadata, found the original and attached it as association `01M41EE2QRBGZBEVMTGRJABY73`. Reload and an explicit retry returned `reused` for that same child/claim. The original queue row `qmsg_qckhfaba8g` and paused run remained. No second spawn or seed occurred. This checks native listing, parent/project/origin/metadata and local attachment. It does not reproduce a real network response loss or active provider before attachment; those use isolated failure injection.

## Safety incident and corrected disable check

I disabled the disposable gate before removing its queued seed. That was the wrong order. BB drained already accepted core work, and the same child reached `starting`. Provisioning entries record a fetch of `origin/main` and the start of worktree creation. The child was immediately stopped and archived, and the queue was removed. No child or claim was compensation-deleted.

All nine retained events fit inside the 100-event history check. They contain six provisioning events, one manual interruption, one client start and one client request, with no provider or tool events. Assistant output is null. Thus no provider turn or agent commands are observed, but native provisioning and a Git fetch did occur. Shared fetched refs were not rolled back. Environment `env_c63weyjwqb` is destroyed with teardown removed, path null and no Git/worktree flags. The exact disposable workspace parent was empty and had no Git worktree registration; its empty directory was removed. No implementation edits are observed.

The corrected check removed queued work and archived/stopped the child before disable/enable. It retained the same archived identity, paused run, zero queued rows and zero interactions. This separates core draining while admission is unloaded from a new plugin spawn or startup replay. Never disable an active gate with accepted queued work still present.

The archive preserves the unsafe timeline, source, native observations and corrected check. The fixture plugin/source/storage were removed after evidence capture. Native child history remains archived. The final report names the evidence attachment IDs and cleanup checks.

## Limits

Only Pi on exact BB 0.44.0 has verified coordinator admission support. Explicit operator decisions trust BB-recorded user/null classification under the approved temporary boundary. This is not proof of human identity; BBP-51 tracks that limit. The installed fixture does not establish human run activation or live operator resolution. Its full-mode fixture preset was selected before creation; recovery never changes permission mode. Provider execution is not an acceptance result.

Native explicit Send-now and unloaded plugins can bypass plugin admission. Pause and clear or resolve queued orchestration work through existing BB controls before disable or rollback. Enable never authorizes resume, and bookkeeping recovery can run while effective authority is paused or interrupted without executing work.

An absent listing is never definite creation failure. Release records explicit risk acceptance and preserves history. Diagnostic or malformed resolution text grants no dispatch. Later separate dispatch must pass all current run, scope, project, blocker, handoff and execution checks, and must freshly inspect the released original. Reports, result handoffs, decision routing, integration and whole-epic acceptance remain with their owning slices. Native done/canceled is not handoff evidence.
