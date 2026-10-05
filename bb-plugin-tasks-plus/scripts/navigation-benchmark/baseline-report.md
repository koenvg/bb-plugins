# BBP-60 measured baseline checkpoint

Tasks-only activation and an owned native fixture are ready for Koen's manual check. Thirty recorded, previously visited movements have a 588.6 ms median and 734.5 ms p95. This is a baseline, not a speed-up. BBP-60 remains incomplete.

## Source and approval

Parent `thr_w7j752igff` reported Koen's explicit "approve" reply to the proposal in `README.md`. The actual user `approve` event is `evt_jmdfcnztq2`, parent sequence 191, request `creq_jzymabaqfp`. It is preserved in `approval-events.json`; the proposal is recorded in `review-result.md` and `approval.txt`.

- Implementation started clean at `43c2804c53cc07f1e7959c9b2bc93000e1c670ce` in shared environment `env_bs69j7zqfe`. Native Ticket prerequisite `78fdd0857c79cc6ed10ea2c3a31bf94e9ba58664` was already integrated.
- Original installation was clean at `6c6bd792926de897215898e01b1e09c14ddba252`. Its native pane/session files match this branch. Original Tasks bundle was `fee57104b9d22277`. Its source and app digest were unchanged immediately before activation. Original `source-identity.json` is unchanged.
- Current Tasks source is this worktree's `bb-plugin-tasks-plus`, enabled and running, bundle `533b943584c7ba90`, app SHA-256 `e90a4cedecea9a84811075945ed731cc45ace0005771a020e8346305c41d92b1`.
- Quota remains enabled and running from `/Users/koen/workspace/bb-plugins/bb-plugin-codex-quota`, bundle `acd64ffbb1fabefc`, app SHA-256 `3d92f16074b991c0529b50a7cbdba34bde3bbbeb64a69987942f52f10127d191`.
- The dedicated page loaded both matching app.js and app.css resource URLs under `/api/v1/plugin-app-assets/533b943584c7ba90/` and `/api/v1/plugin-app-assets/acd64ffbb1fabefc/`. Browser was Chrome `153.0.8010.12` on Darwin arm64, 1440x900, CPU throttling rate 1.

The old installation's list differs from this branch's upstream list-declutter change. No old-versus-new-list speed comparison is made. No BBP-61 through BBP-67 optimization was implemented. There was no global restart, quota activation, settings change or existing browser takeover.

No commit was made. The benchmark directory is an untracked writer change against the starting commit; the runtime bundle above is the measured identity. The parent can inspect and commit this focused change.

## Owned fixture

Tracker project `01M438V5VZN4P2JQYYYEHY5597`, prefix `BENCH`, name `BBP-60 owned native baseline · thr_3kr8equw8g`.

The native APIs confirm 100 task IDs, 3 label IDs, 50 comment IDs and 10 attachment IDs. All IDs and synthetic-to-native mappings are in `ownership.json`. The activity case has 25 user and 25 agent comments on BENCH-100. BENCH-1 through BENCH-10 form the consecutive warm window. Dates, labels and approximately 2 KiB Markdown descriptions match the manifest.

Canonical fixture file SHA-256 is `13d5abf519dc9d449be54e80ed92dda31fd7a03b250c6a720da8b7d136db8cc6`. Keep this manifest, mapping and baseline snapshots for paired runs. Before a later run, check display fields and record any live invalidation. The original run did not log invalidation events individually, so it proves the previsited protocol, not uninterrupted cache-current state.

## Timing and work

Thirty final samples all passed the selected row, native detail key, exact title, description marker, rendered paragraph/list/link and viewport checks. The captured ArrowUp/ArrowDown event starts each sample. The second matching animation-frame callback ends it. Four separate profile samples each have trace Paint events between matching readiness and the end mark. This establishes a presentation opportunity, not a physical display paint.

| Final unprofiled result                 |     Value |
| --------------------------------------- | --------: |
| Valid recorded movements                |        30 |
| Median                                  |  588.6 ms |
| p95, nearest rank                       |  734.5 ms |
| Worst                                   |  810.7 ms |
| Samples with blank intervals            |        30 |
| Total frame-sampled blank time          | 6692.7 ms |
| Observed long tasks in run window       |        99 |
| Long-task duration total                |  17912 ms |
| Worst long task                         |    395 ms |
| Captured RPC starts across five batches |       378 |
| Completed resource entries observed     |       397 |

Request counters include ambient plugin traffic and can miss calls outside the batch listeners or still in flight. Main Tasks RPC start counts were 35 task lookups, 75 task-list reads, 36 comments reads and 34 attachment reads. Other inventory, thread, PR, work-status and preset counts are in `latency-summary.json`. These are run-level observations, not a complete count of one lookup.

The final run used five six-movement batches after an 18-movement warm-up. All 30 recovered final samples are included. Six additional planned movements were attempted, but their oversized CLI response stopped the session. Their raw samples are unavailable, not zero or successful. That transport failure is preserved. Do not treat the recovered statistics as a complete 36-sample run.

Earlier monolithic profile and latency drivers also timed out. A supported bounded probe protocol succeeded. Setup/import/size errors and timeouts remain in the archive. No failed attempt is included as a warm success.

## Separate cases

- Nine first-visit cold samples ranged from 540.9 to 1276.8 ms. Warm-up return visits stay separate from final statistics.
- The separate four-movement CPU/timeline profile observed 9840 page-wide `toLocaleDateString` calls, taking 435.0 ms. These calls are not all attributed to Tasks rows. Its latency values are excluded from final percentiles.
- Within the profile's marked span, inclusive trace categories were layout 932.4 ms, style update 731.9 ms, paint 7.8 ms and pre-paint 10.3 ms. Do not add nested category totals as independent cost. Full CPU profile and trace are retained.
- BENCH-100 initial click-to-presentation took 499.4 ms. One comment editor existed at initial presentation; the loaded feed then had 51 comment editors, including the composer. The isolated observation captured 52 attachment RPCs, including the task reads and per-comment reads. Scrolled-feed timing and compact layout remain for manual verification.
- An injected, owned BENCH-2 read failure kept row/detail identity on BENCH-2 with error content and no stale BENCH-1 heading. Its failed sample timed out at 5016.6 ms and is not in warm statistics.
- An injected, delayed BENCH-1 save failure blocked the requested BENCH-2 movement. BENCH-1, its title draft and Retry save remained. The save-pending sample timed out at 5002.2 ms because selection correctly did not move.
- Removing that interception before reload allowed the normal session to flush the owned test title. The title was then restored through the native API. All 100 tasks' display fields now match the original manifest, and there are no extra system comments. BENCH-1's updatedAt changed; this metadata difference is disclosed in `save-scenario-restoration.json`.
- A-to-B-to-A retained the unsent A comment. ArrowDown inside the composer kept BENCH-1 selected. The complete B-draft return, Ticket close/park/reopen and compact drawer checks remain unverified in the live host.

## Checks and review

- Focused benchmark tests: 11 pass. Fixture generation and guarded local cleanup pass. Syntax checks apply to the benchmark modules.
- Tasks: 966 tests in 89 files, typecheck and local build pass. Tasks lint is blocked by undeclared `oxlint`, tracked in BBP-104. No unrelated lint fix was made.
- Quota: 117 tests in 14 files, typecheck, local build and synthetic bundle OAuth checks pass.
- One fresh read-only completion review requested two fixes. Canonical fixture hashing and guaranteed CDP detachment were fixed with red-then-green regression tests. No second review ran. See `review-result.md` for the writer's disposition.
- The complete monolithic page driver is not live-validated; it timed out. The measured run used the same probe through the bounded scripts retained in the archive. Do not report a mock-driver test as a live-driver pass.

BBP-60 is not done. Remaining gates are Koen's manual native-pane/draft/compact/feed check, a stable bounded rerun without lost samples, explicit invalidation qualification, and resolution or acceptance of the existing lint setup gap. This task does not claim the later change's 100 ms target is met.

## Open and test

In BB, open Tasks, choose `BBP-60 owned native baseline · thr_3kr8equw8g`, choose List, and click BENCH-1. The project is not linked to another BB project.

On the BB host, the direct list URL is [the owned BENCH project](http://127.0.0.1:38886/plugins/tasks-plus/tasks/01M438V5VZN4P2JQYYYEHY5597?view=list). Use the project picker when that host-local address is not reachable.

1. Use Up/Down through BENCH-1 to BENCH-10. Check the row key, title and description heading each time.
2. Write different unsent comments on BENCH-1 and BENCH-2. Return to each. Do not submit them.
3. Close or switch away from Ticket, then reopen it from the selected row. Check task and drafts. Repeat in compact layout.
4. Type navigation keys in the editor and while a menu is open. Check that selection stays fixed.
5. Open BENCH-100 and scroll through all 50 comments and ten text attachments. Check keyboard access to the composer.

The owned fixture remains for this manual check and paired runs. No rollback or fixture deletion ran. Any manual saved change must be recorded and normalized before another timing run.

## Artifacts and rerun

The task attachment `BBP-60-baseline-evidence-thr_3kr8equw8g.tar.gz` contains the manifest, ownership map, approval, original and activated identities, raw samples, separate cases, CPU profile, timeline, trace checks, summaries and exact bounded driver scripts. Private browser connection files and temporary driver dependencies are excluded.

Local evidence directory: `/tmp/bbp60-thr-3kr8equw8g-evidence`. Fetch the task attachment before relying on temporary files after a reboot. The source tooling and original identity snapshot are in this repository.

For a paired rerun, use a new approved owned browser on the same host/version with the same fixture and viewport. Verify current plugin bundles and fixture fields. The recorded `probe-inject.js` injects only the owned probe through page evaluation. Run warm-up batches separately, dispose that probe, create a clean latency probe, and run the five recorded six-movement latency batches. Use a new evidence directory and fetch samples, long tasks and resources in separate bounded responses. Never print an unbounded run object through the browser CLI; its observed transport limit was 65536 bytes. Preserve each batch before the next. Keep CPU/date profiling in a different run.

Reproduce the summary with:

```sh
node bb-plugin-tasks-plus/scripts/navigation-benchmark/cli.mjs report /tmp/bbp60-thr-3kr8equw8g-evidence/latency-raw.json
```

## Cleanup and rollback

Do not remove the fixture before Koen's feedback and the paired-run decision. For cleanup, first compare the live project, all task/comment/label/attachment IDs and display fields with `ownership.json`, `fixture.json` and `final-fixture-check.json`. Stop on unexpected additions or user changes. Do not use titles alone as ownership proof.

Only after that check, write an input file containing exactly:

```json
{ "projectId": "01M438V5VZN4P2JQYYYEHY5597", "force": true }
```

Then call `bb plugin rpc call tasks-plus deleteProject --input-file OWNED_INPUT.json --json`. The native handler deletes that project's records and owned attachment blobs. No other project or task can be included. Retain the task evidence attachment.

Owned browser sessions were `95e4a3ab-895a-417d-bea4-4b74551a9af9`, `53a7ef6d-5433-4d0d-9b15-c216404eadca`, `01863ed2-8771-4e17-9a8e-34e59d4a5e64` and `9810ee71-6ac9-4223-82fc-15c4ea595d86`. All four sessions are closed; no existing user browser was acquired. Close only a still-owned session with `bb browser-automation close SESSION_ID --json`. Do not acquire or close a user's browser. Local fixture cleanup uses the guarded CLI in `README.md`; remove the remaining owned evidence directory only after confirming its ownership and durable attachment.

If rollback is needed, first recheck the original checkout is clean at `6c6bd792926de897215898e01b1e09c14ddba252` and its app digest still matches `source-identity.json`. Stop on a concurrent change. The approved source rollback is `bb plugin install path:/Users/koen/workspace/bb-plugins/bb-plugin-tasks-plus --yes --json`. Keep quota, other plugins, tracker data and settings unchanged. Do not remove Tasks or restart BB.
