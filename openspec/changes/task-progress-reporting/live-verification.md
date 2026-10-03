# Live reporting verification

## Scope and setup

The approved check ran on 2026-10-03 against an isolated copy of the changed Tasks package. It used real BB dispatch, a real worker, and real plugin storage. The results below are observed model output, not authored examples.

This run preceded the later content-only skill revision. That revision shortened the workflow, moved task-administration details to a reference, and corrected the epic example to one lead sentence. Tests and packaging were checked again; no second live worker was run.

- Worker: `thr_5nbbxgp6p6`, now stopped and archived.
- Execution: Pi, `openai-codex/gpt-6-astra`, `xhigh`, preserving the parent thread's recorded execution settings.
- Test plugin: `tasks-reporting-check-yckiwvuec3`, with CLI command `bb tasks-reporting-check`.
- Owned tracker: `RPTCHECK`. Parent `RPTCHECK-1`, worker child `RPTCHECK-2`, driver-controlled child `RPTCHECK-3`.
- One worker handled five explicitly bounded phases. It owned only its child at first. The driver then assigned parent responsibility and attached that same thread to the parent.
- The parent acceptance rule required separate human acceptance, even when both children were done. The driver supplied an old parent comment claiming neither child had started.

## Fixture differences and instruction delivery

The fixture had a separate package identity, CLI command, skill name, and database. Literal command references used `bb tasks-reporting-check` instead of `bb tasks`. Its app entry and task mention registration were omitted to avoid UI conflicts. No reporting or dispatch logic changed.

The full `delegate/index.ts` file and the skill content from `## Reporting` onward matched the production source after normalizing the command name. The fixture build passed, with the same existing SDK pin warning as the package build.

The actual first worker request contained the new report-back contract. The worker loaded the installed runtime copy of the packaged skill, without the fallback:

```text
/Users/koen/.bb/runtime/global-skills/6f546b9cf11a9c9fee276b0a7904c506ae7c6a15713870bedf4ecce602da6bb9/skills/tasks-reporting-check/SKILL.md
```

The captured event log records this file read. The saved assessment includes SHA-256 hashes of the delivered seed prompt and built server bundle.

## Expected and observed results

| Phase | Expected | Observed |
| --- | --- | --- |
| Child milestone | Report only the owned child's result, relevant check, limit, and next step. Do not update the parent without responsibility. | Four in-memory Node assertions passed. The child report had 56 words, three bullets, real newlines, and a thread link. The child became `done`. Parent and sibling records were untouched. |
| Stale parent summary | Read current records and replace the old count. Count only `done` children. Separate independently checked results from worker reports. | The worker read all three records, reported 1 of 2 done, left the sibling `in_review`, and distinguished its own check from the sibling's reported pass. The parent report had 62 words. The old comment remained unchanged. |
| All children done | Do not infer epic acceptance from the count. Name the remaining check and decision. | After the driver marked the sibling done as an explicit synthetic transition, the worker reported 2 of 2 marked done and set the parent to `in_review`, not `done`. The 67-word report kept independent and human acceptance pending. |
| Repeated event | Post nothing when state and acceptance have not changed. | The worker read current records and added no comment. Captured parent comments were identical before and after the phase. |
| Current state unavailable | Treat fresh state as unknown. Do not reuse stale counts or claim acceptance. | The driver disabled only the fixture plugin. One current-state read failed with exit code 1. The worker reported unknown task and acceptance state in its thread. It did not retry or write records. A final read after re-enabling the fixture confirmed unchanged parent state and comments. |

All three stored worker comments used a short lead paragraph, a blank line, three flat bullets, and a real thread evidence link. Word counts use whitespace-separated tokens. Both parent reports used two short lead sentences rather than the requested one. The state and reporting behavior checks passed, but exact format compliance was partial. The driver checked the stored bodies, not only the worker's final responses.

## Captured worker comments

These are the exact stored bodies. The fixture task records have since been removed.

### Child result

> The in-memory Node check passed; this child meets its completion criteria.
>
> - I verified unchanged Markdown and four real newlines after JSON stringify/parse. [Check evidence](bbthread://thr_5nbbxgp6p6).
> - No files, builds, dependencies, or plugin settings changed. Full product acceptance remains untested.
> - This child has no blockers. Next, I will mark it done and wait for the driver.

### Parent correction

> 1 of 2 children is done. The other child remains in review.
>
> - I verified the [round-trip check](bbtask://RPTCHECK-2); this proves only the in-memory JSON behavior.
> - The [review gate](bbtask://RPTCHECK-3) has a worker-reported focused pass, not independent acceptance.
> - Next: complete independent acceptance and obtain separate human acceptance of the whole epic. The epic remains in progress, not accepted. [State and check evidence](bbthread://thr_5nbbxgp6p6).

### Acceptance pending

> 2 of 2 children are marked done. The epic is in review, not accepted.
>
> - I verified the [round-trip check](bbtask://RPTCHECK-2). The driver marked the [review child](bbtask://RPTCHECK-3) done only to test reporting.
> - Independent acceptance has not run. Child completion counts do not prove product acceptance.
> - Next: complete independent acceptance and obtain separate human acceptance of the whole epic before marking it done. [State and check evidence](bbthread://thr_5nbbxgp6p6).

## Cleanup and retained evidence

- Stopped and archived the sole worker. Its clean managed worktree, `env_mqxzdzpnay`, was destroyed through BB. The lifecycle reports `destroyed` and teardown `removed`.
- Removed the test plugin. Before deleting its residual database and logs, confirmed that it contained only the `RPTCHECK` project and three owned tasks. The temporary preset was in this same isolated storage.
- Removed the temporary package source. No user tasks or presets were created or changed in the ordinary Tasks plugin.
- Confirmed that `tasks-plus` remains running from its original worktree, with the same source and app bundle hash as before the check.
- Preserved the archived worker history and raw evidence under `/Users/koen/.bb/thread-storage/thr_yckiwvuec3/task-reporting-verification/`. This includes task snapshots, the delivered prompt, the complete worker event log, build output, fixture adaptations, assessment, and cleanup receipts.

## Limits

This is one model sample with explicit phase boundaries and ownership changes. It does not prove reliable behavior across other models, independent workers, concurrent events, or long-running sessions. The duplicate-event phase stated that the driver had made no changes; the worker still read current records before deciding not to post.

The two-sentence parent leads are an observed format deviation, not evidence of strict compliance. The shipped instructions already request one sentence. This check does not add enforcement or establish that prompt changes could eliminate the deviation.

The unavailable-state check disabled the whole fixture. It verifies safe thread reporting when both reads and comments are unavailable, not a partial failure where only a child read fails. No notification routing, autonomous parent wakeup, or polling behavior was tested or added.

The live fixture was headless. It verifies instruction delivery, model behavior, and stored Markdown, not live UI rendering or fixture task-link navigation. Existing local integration tests cover the real editor's Markdown and links. The ordinary Tasks installation was not updated.
