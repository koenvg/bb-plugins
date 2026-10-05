# BBP-60 paired baseline

The bounded baseline is complete. All 36 final movements are preserved and qualified. No optimization was made. The 100 ms change-wide target is not met. This report does not claim that all existing host behavior is correct.

## Acceptance and scope

Koen's feedback, reported by parent `thr_w7j752igff`, was "You can continue with this one. The baseline looks good." This accepts the manual baseline checkpoint. It does not prove individual scenarios or waive technical checks. The original activation approval remains parent event `evt_jmdfcnztq2`, sequence 191, request `creq_jzymabaqfp`.

The actual BBP-60 criteria require source provenance, owned fixtures, at least 30 controlled movements, presentation timing with matching identity, separate cases and profiling, work counts, rerun/cleanup instructions and green save/draft/native-pane tests. They do not require this baseline to meet the later 100 ms target or to fix every existing host defect.

The original single completion review returned two P2 findings. The canonical digest and CDP cleanup fixes remain covered by regression tests. No second review ran. The added qualification observer has writer-run test-first coverage and real-protocol checks; the original reviewer did not re-review that later addition.

## Exact measured identities

- Environment `env_bs69j7zqfe`, host `host_dt6w76k4w8`, Darwin arm64. Source HEAD remains `43c2804c53cc07f1e7959c9b2bc93000e1c670ce`. No commit was made. Only the untracked benchmark directory was edited.
- Native prerequisite `78fdd0857c79cc6ed10ea2c3a31bf94e9ba58664` was already integrated. The original identity snapshot `source-identity.json` is preserved.
- Tasks source `/Users/koen/.bb/plugins/environment-git-worktree/host-data/worktrees/thr_w7j752igff-1/bb-plugins/bb-plugin-tasks-plus`, version 0.1.2, enabled/running, bundle `533b943584c7ba90`, served app SHA-256 `e90a4cedecea9a84811075945ed731cc45ace0005771a020e8346305c41d92b1`.
- Quota source `/Users/koen/workspace/bb-plugins/bb-plugin-codex-quota`, version 0.1.0, source commit `6c6bd792926de897215898e01b1e09c14ddba252`, enabled/running, bundle `acd64ffbb1fabefc`, served app SHA-256 `3d92f16074b991c0529b50a7cbdba34bde3bbbeb64a69987942f52f10127d191`.
- Chrome `153.0.8010.12`, V8 `15.3.76.4`. Final timing viewport 1440x900, CPU rate 1. Both app.js and app.css bundle URLs were observed. Only fresh owned headless sessions were used.

No newer main was merged. No quota activation, global restart, other worktree edit, existing browser takeover or later implementation slice ran.

## Fixture and saved-data checks

Project `01M438V5VZN4P2JQYYYEHY5597`, prefix BENCH, name `BBP-60 owned native baseline · thr_3kr8equw8g`. It has exactly 100 tasks, three labels, 50 comments and ten text attachments. All native IDs and mappings remain in the original `ownership.json`.

The canonical fixture SHA-256 remains `13d5abf519dc9d449be54e80ed92dda31fd7a03b250c6a720da8b7d136db8cc6`. BENCH-1 through BENCH-10 are the consecutive navigation window. BENCH-100 holds the separate activity case.

Preflight compared every task's display fields, relationships, order and revision, all comment bodies and ownership, labels and attachment metadata. The ten downloaded text files match the original bytes. The public attachment API omits private blobPath; that schema difference was recorded, not treated as a user edit. No saved operator change or added data was found. BENCH-1's known revision from the earlier owned title restoration is `2026-10-04T11:28:34.503Z`.

Postflight confirms that all task fields and revisions, labels and the 50 stored comments still match preflight. No saved field was normalized or overwritten in this resumed run. The fixture is retained for paired after-runs.

## Original and new measurements

| Result                          |                       Original checkpoint |                                                   New paired baseline |
| ------------------------------- | ----------------------------------------: | --------------------------------------------------------------------: |
| Recorded final movements        |                                        30 |                                                                    36 |
| Lost additional samples         |                                         6 |                                                                     0 |
| Qualification                   | Previsited only; invalidations not logged | Confirmed loaded revision, still current under observed invalidations |
| Median                          |                                  588.6 ms |                                                              404.6 ms |
| p95, nearest rank               |                                  734.5 ms |                                                              469.9 ms |
| Worst                           |                                  810.7 ms |                                                              470.8 ms |
| Samples with blank intervals    |                                        30 |                                                                    36 |
| Frame-sampled blank time total  |                                 6692.7 ms |                                                             5566.7 ms |
| Observed long tasks             |                                        99 |                                                                    73 |
| Long-task duration total        |                                  17912 ms |                                                              12738 ms |
| Worst long task                 |                                    395 ms |                                                                224 ms |
| Observed RPC start-time records |                                       378 |                                                                   400 |
| Observed completed resources    |                                       397 |                                                                   404 |

The source and runtime bundle did not change between these runs. Different observation protocols and host activity prevent a speed-up claim. The new complete run is the paired-run reference.

All 36 samples passed matching selected row, detail key, exact heading, description marker, rendered paragraph/list/link and viewport checks. The event starts at captured keydown and ends at the second matching animation frame. The original separate trace has Paint events in the matching presentation interval. This measures a presentation opportunity, not physical display pixels.

The new 400 RPC starts come from the six persisted batches' native request listeners. They include ambient calls during each batch, but not starts between batches. Long-task and resource observers run across the gaps too. Completed resource entries are a separate cohort and can miss requests still in flight at disposal. Per-endpoint starts, raw intervals and per-sample marks remain in `latency-raw.json` and the bounded batch files. Samples and work data were fetched separately; no large run object crossed the CLI response limit.

## Explicit warmth qualification

`qualification.mjs` records successful native getTaskByKey responses, their request epochs and exact updatedAt revisions. It observes native WebSocket messages before the host app starts, without publishing synthetic signals or altering subscriptions. The real host runtime uses `plugin-signal` with pluginId and channel. The real RPC response is `{ok:true,result:{task}}`; a failing envelope test preceded the fix.

Any own tasks/projects/comments/threads signal invalidates all recorded entries conservatively. Socket open/close/error, online/offline, pagehide, the Refresh tasks button and a possible refresh shortcut also invalidate them. A response begun before invalidation cannot restore warmth. Unexpected revisions, parse gaps and attempted task writes block clean qualification. Invalidation during a movement reclassifies it as cold and remains in the raw evidence.

Connection open created epoch 1. A real, read-only manual refresh control created epoch 2 before warm-up. Its current task was re-confirmed. Nine first visits and nine returns then loaded all ten entries at epoch 2. Before the final run, all ten had a successful matching revision. During all 36 final movements the epoch remained 2, with no delivered invalidations, observer errors or mutation attempts. Each sample records current-at-start and current-at-end, not just a prior visit.

This ledger proves still-current observed read versions. It is not an application preview cache and does not claim the unoptimized app retains preview data between keys. It does not inspect private React state or backend changes never delivered to this connection. Identical pre/post saved fields and revisions provide an independent check. Internal refresh calls outside the observed UI and socket routes are not separately tagged. These limits apply to paired reruns too.

## Separate evidence and host checks

The original archive retains cold timings, the four-movement CPU profile and timeline, 9840 page-wide date calls taking 435.0 ms, the initial heavy presentation, the injected failed read and save-pending/failure evidence. None enters either final latency percentile. The earlier teardown title write and its restoration remain disclosed.

This resumed run additionally verified:

- Different unsent A and B comments survive A/B/A/B desktop navigation. ArrowDown inside the composer and inside an open labels dialog keeps BENCH-1 selected. No comment or label was submitted.
- Native right-panel hiding parks the existing editor under a hidden parent. Reopening from the selected row restores the same DOM node and A draft. Moving to the native new-tab picker and back to Ticket also preserves that node and draft. The fixed Ticket tab did not expose a separate remove-tab context action; native tab-unmount paths remain covered by the existing automated tests.
- Crossing from desktop to 600 px causes the old editor node to become disconnected. Reopening the correct BENCH-1 drawer shows an empty A composer. This reproduces the existing BBP-50 host-page remount defect. It is a failed live check, not a passed manual-acceptance scenario. No production fix was attempted under BBP-60.
- All 50 distinct activity bodies are reachable by scrolling. Ten text attachment links are present. After its asynchronous focus settles, the existing `m` command focuses the editable composer without submitting text or changing BENCH-100. The first five-second cold feed wait timed out; that attempt remains, alongside the later settled proof. Immediate focus and attachment-title snapshots were incomplete observations, not evidence of missing controls.

BBP-50 already records the same responsive remount defect. It is reused, not duplicated. It is an existing host-contract gap for the wider feature, not a regression from this benchmark-only change or a newly invented BBP-60 implementation requirement.

## Verification and lint decision

Seventeen focused Node tests pass. New observer coverage includes previsited versus current, broad invalidation, stale completion, changed revision, attempted writes, real response envelope and wrapper cleanup. Node syntax and whitespace checks pass for the benchmark files.

After timing ended, Tasks passed 966 tests in 89 files, typecheck and local build. No quota source was changed; its earlier 117 tests, typecheck, build and synthetic OAuth bundle checks remain historical verification, not newly rerun checks.

Tasks lint still exits 127 because oxlint is unavailable. BBP-104 is the existing independent follow-up. No dependencies were changed and no waiver is inferred. BBP-60 does not specify lint; the project README and `.github/workflows/tests.yml` explicitly define the required CI gate as npm ci/npm test and say lint is not run. The required affected tests pass, and affected JavaScript syntax checks plus extra typecheck/build pass. This existing lint setup gap therefore does not block this baseline task. It remains unresolved.

## Reproduce the paired run

Use the source tooling and exact driver scripts in the new archive, with a fresh owned session on the same host and Chrome version. Do not use an existing user session. Check both installed bundles, source paths, enabled states and fixture records first. Stop on an unexpected saved edit, new ID or changed revision; do not overwrite it.

1. Make a new evidence directory. Use its current saved task revisions to generate the expected-revision map. The recorded `final-setup.js` demonstrates installing qualification observers with evaluateOnNewDocument before navigation, then the page-only presentation probe. Do not reuse an expired session ID.
2. Set 1440x900 and send Emulation.setCPUThrottlingRate with rate 1 on that owned page. Open [the owned list](http://127.0.0.1:38886/plugins/tasks-plus/tasks/01M438V5VZN4P2JQYYYEHY5597?view=list), then BENCH-1. Confirm actual response parsing, socket observation and save-free state.
3. Run the read-only refresh control separately. Use `warmup-movements.json` and three six-movement batches. Preserve cold and return samples. Confirm all ten loaded entries are current after warm-up.
4. Dispose the warm-up probe and create a new latency probe. Keep the qualification ledger. Use `latency-movements.json` and `run-batches.cjs`, with the new session and evidence directory. Each six-movement result must be written before another batch starts. Six complete batches give 36 attempts. Record any invalidated or failed attempt, then obtain additional qualified movements only with the extra attempts preserved.
5. Dispose the timing probe. Export samples separately from requests and long tasks. Read large arrays in 20-entry slices, preserving every slice. Do not print the entire export. Verify unchanged revisions and no mutation/error records. Then run report generation on the assembled raw file:

```sh
node bb-plugin-tasks-plus/scripts/navigation-benchmark/cli.mjs report NEW_EVIDENCE/latency-raw.json
```

The saved driver accepts only a phase argument; its directory and session ID are fixed constants. Copy it and both movement files into the new evidence directory, change only the copy's `dir` and `id`, and retain the original. Run the warm-up command at step 3, then the latency command only after step 4's fresh probe setup:

```sh
node NEW_EVIDENCE/run-batches.cjs warmup
node NEW_EVIDENCE/run-batches.cjs latency
```

Keep CPU and date profiling in another run. Use this new qualified baseline, not the earlier incomplete run, for comparison. Match qualification and observer code too. Do not treat row/detail presentation as proof of fresh thread/PR lifecycle state.

## Retained resources, cleanup and rollback

All dedicated browser sessions are closed or expired. Unsent validation drafts were local to those sessions. No existing browser was acquired. The owned native project and its original 100/3/50/10 resources remain for after-runs. Evidence attachments are durable; temporary directories are not.

The new attachment `BBP-60-paired-baseline-evidence-thr_3kr8equw8g.tar.gz` contains the untouched original archive, the new raw batches and sliced work data, qualification log, pre/post snapshots, images, errors, tests, manual-feedback record and source tooling. Original task attachments, comments and source-identity.json remain unchanged.

For fixture deletion after paired runs, verify the live IDs against original ownership and the new saved-data snapshot. Stop on additions or user edits. Supply only `{"projectId":"01M438V5VZN4P2JQYYYEHY5597","force":true}` to `bb plugin rpc call tasks-plus deleteProject --input-file OWNED_INPUT.json --json`. The handler removes that project's records and owned attachment blobs. Verify counts and blob results; retain durable evidence.

Guarded local fixture cleanup remains in `README.md`. Remove only these owned temporary evidence directories after their durable attachments are confirmed. Never remove another tracker, browser, worktree or source checkout.

For approved rollback, first confirm original Tasks source is still clean at `6c6bd792926de897215898e01b1e09c14ddba252` and its digest matches the preserved original snapshot. Stop on concurrent changes. Run `bb plugin install path:/Users/koen/workspace/bb-plugins/bb-plugin-tasks-plus --yes --json`, leaving quota, user data and all settings unchanged. Do not restart BB. No rollback has run.

## BBP-61 handoff

The timing window has ended. No application or quota implementation was changed. Start from the current shared checkout without merging newer main or committing this worker's files. Preserve this benchmark directory, fixture and original snapshots. Reuse the new protocol for paired runs. Scope the next change to its own ticket; no later optimization was included here. Keep BBP-50's observed compact draft loss and BBP-104's lint setup gap visible rather than claiming the whole navigation change is accepted.
