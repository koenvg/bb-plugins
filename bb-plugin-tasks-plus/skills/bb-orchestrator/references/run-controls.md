# Run controls

## Temporary trust boundary

Koen approved the temporary boundary on 2026-10-03. The plugin trusts BB-recorded `user` input with a null sender for an exact explicit invocation, and a persisted native submitted decision for approval. This does not prove human identity. BB 0.44.0 can classify agent self-sends as user/null. Follow-up tracker task BBP-51 investigates that limit. It is separate from this epic and does not block the temporarily revised contract.

Observed agent/system input and cross-thread messages cannot activate a run. Installation, enable, reload, skill discovery, automatic consideration, quoted commands, ordinary discussion and editable metadata grant no authority. Unverified provider paths refuse activation. Native decisions and invocation references are not a security boundary against an agent that BB itself classifies as user.

## Invocation

The verified path is BB 0.44.0 with Pi provider 0.1.0. Disposable fixture `thr_4msh54iqm5` verified the native command, both selected-skill triggers through the installed SDK/Pi bridge, and persisted native approval. Selections came from a fixture SDK probe, not a picker click. These checks do not prove human identity. Use one leading selected `bb-orchestrator` skill mention or the exact native `/skill:bb-orchestrator` command. Arguments are one JSON object, not prose or CLI flags. These are user submissions to the coordinator, not shell commands:

```text
/skill:bb-orchestrator {"action":"begin","config":{"epic":"ABC-1","tasks":["ABC-2","ABC-3"],"preset":"Execution preset","baselineReferences":["commit:<sha>","branch:<name>"]}}
/skill:bb-orchestrator {"action":"pause","runId":"<run-id>"}
/skill:bb-orchestrator {"action":"resume","runId":"<run-id>"}
```

A bare invocation means begin with missing parameters. One native form supplies the epic, selected existing direct subtasks, preset and baseline references, then shows their complete tracker scope and execution selection for approval. A complete begin or resume also uses one native approval form. This is approval of the run, not repeated approval for routine eligible dispatches.

Run the matching control from that coordinator:

```sh
bb tasks orchestrate begin --request latest --json
bb tasks orchestrate pause --request <persisted-request-id> --json
bb tasks orchestrate resume --request latest --json
```

`--thread <id>` is for CLI calls without a thread context. A caller with a different thread context is refused. RPC names are `orchestrateBegin`, `orchestratePause`, `orchestrateResume` with `{coordinatorThreadId, requestId}`, and read-only `orchestratePreview` with `{coordinatorThreadId, config}`. Do not treat an RPC parameter or metadata field as approval. Controls read the persisted BB request themselves.

Begin/resume return `pending` at once. The form belongs to the plugin and stays open after the agent command ends. After the native decision, make one result lookup with the same request ID; do not poll. Once submission has reached the plugin, that lookup waits for its existing validation before returning the stored completion. CLI transport timeout or abort is not native cancellation and does not discard request identity or prevent a later valid settlement. It returns the stored run, cancellation/error, or interrupted request. This prevents a normal agent command timeout from cancelling user approval. Decision validation errors stay in the durable request result.

Only the latest unambiguous request can start new control work, within 15 minutes. The history lookup is limited to 100 requests. Identical completed or pending request retries reuse their run/form, including after the request is older than 15 minutes if still in that lookup window. Input with multiple message groups, hidden text, attachments, retry markers or multiple skill mentions is refused. A newer invocation invalidates a pending approval.

## Run state and scope

Migration 8 adds `orchestration_runs` and `orchestration_run_requests`. Existing tasks, dependencies, associations, presets, comments and attachments stay unchanged. No workers are created or sent messages by begin/pause/resume.

A run stores its epic, coordinator, approved task IDs, tracker fingerprints, complete execution snapshot, baseline references, explicit invocation and native decision references, phase, generation and timestamps. Fingerprints cover IDs, project/parent membership, title and description, including linked-specification references and epic acceptance text. They do not cover repository files. Status, dependencies, comments and reported artifacts are not scope edits. Workers must report linked-file content changes; the coordinator does not inspect them.

A changed fingerprint or preset requires explicit resume approval before more work. Resume cannot add tasks, select another preset ID, change the epic or change baseline references. That needs separate scope approval, not silent expansion. The form is limited to 100 selected tasks, 16 baseline references and 48 KiB for the complete native form payload, including config and request identifiers. It refuses oversized data rather than truncating scope.

The controller's `readRun(epicId)` returns the authoritative record or null, with an interrupted view when its generation differs from the current plugin load. `requireActive(runId, coordinatorThreadId)` checks ownership, active generation and current scope/execution before downstream dispatch or continuation. BBP-36 must call it and map the actual record into BBP-34's `CoordinationReader`; this slice does not provide a status placeholder as authority.

BBP-36 must also recheck live BB coordinator thread/project facts at admission. `requireActive` checks stored coordinator ownership, effective generation and current Tasks scope/execution; it does not query live BB thread/project facts. A failed CLI response grants no authority and does not cancel a durable pending request or permit a duplicate. Admit only a durable approved run with effective active phase. Pending and durably cancelled or failed requests remain inadmissible.

On reload/restart, stored active records are not modified or resumed. A new controller generation makes them interrupted until a new explicit resume decision. An unfinished request from another generation returns interrupted, or cancelled if BB cancelled its form. Retry does not open it again. Use a new explicit invocation. Paused records remain paused. Worker state is not changed. Pause does not cancel work already accepted by BB, and resume never restarts a manually stopped worker.

Pause runs and resolve queued work through existing BB controls before disabling the plugin. Disable removes plugin admission checks; enable is not permission to resume. Package rollback preserves the additive tables and does not cancel accepted BB work.

## Separate approvals and acceptance

Run control approves only coordination of selected existing scope and its intended baseline. It does not approve publishing, merging, production operations or scope expansion. A later answer router must relay only an explicit recorded decision for its exact run/question/worker, under the same BBP-51 limitation. The coordinator cannot invent an answer or convert general run authority into a restricted approval.

Whole-epic acceptance remains separate. Completed subtasks or an active run do not establish acceptance. Use an approved integration worker's explicit evidence and result references.
