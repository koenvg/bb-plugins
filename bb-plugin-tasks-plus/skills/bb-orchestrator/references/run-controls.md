# Scope controls

## Manual-first meaning

The stored run is a scope record. Its active/paused/interrupted phase is not native worker activity. Begin and resume record consent for existing selected scope, a preset snapshot and baseline intent. They do not dispatch, start, resume, seed, send or queue a worker. Pause changes the scope record only and does not stop or cancel accepted native work. New orchestrator dispatch and adoption return `deferred` before claim creation or execution.

The skill summarizes records and operator decisions. It does not issue ordinary Tasks or thread commands to recreate the deferred automation. Existing operator-led Tasks controls remain separate.

## Native invocation and consent

The retained verified scope-control path is Pi on BB 0.44.0. Use one leading selected `bb-orchestrator` skill mention or an exact native invocation, with one JSON object:

```text
/skill:bb-orchestrator {"action":"begin","config":{"epic":"ABC-1","tasks":["ABC-2"],"preset":"Existing preset","baselineReferences":["commit:<sha>"]}}
/skill:bb-orchestrator {"action":"pause","runId":"<run-id>"}
/skill:bb-orchestrator {"action":"resume","runId":"<run-id>"}
```

A bare begin resolves missing parameters in one native form. The actual user must submit that form; chat agreement, an old decision or desktop availability is not consent. The temporary BBP-51 boundary trusts persisted BB user/null invocation and native submitted decisions, not independently verified human identity. BB 0.44.0 can classify agent self-sends as user/null. Observed agent/system, cross-thread, quoted, mixed, stale and metadata-only input refuses control. Other provider paths remain unverified.

From that same coordinator, run the requested scope control:

```sh
bb tasks orchestrate begin --request latest --json
bb tasks orchestrate pause --request <persisted-request-id> --json
bb tasks orchestrate resume --request latest --json
```

RPC equivalents are `orchestrateBegin`, `orchestratePause`, `orchestrateResume` with coordinator/request references. `orchestratePreview` is read-only. CLI thread IDs and RPC parameters do not supply consent. The controller reads the persisted source itself.

Begin/resume return pending immediately. The form belongs to the plugin, not the CLI process. After actual submission, make one result lookup with the same request ID. No polling or fabricated event is needed. A CLI timeout is not native cancellation. Duplicate source requests reuse their stored form/run, not another form. New work requires the latest unambiguous invocation within fifteen minutes, bounded to 100 history candidates. A newer invocation invalidates pending approval.

## Record and history

Migration 8 retains run/request identities, selected task fingerprints, coordinator/project, preset snapshot, baselines, decision references, generation and timestamps. Scope includes existing direct subtasks. New tasks, a different epic, preset ID or baseline need separate scope approval. Selected scope is bounded to 100 tasks, sixteen baselines and a 48-KiB native form. Oversized scope refuses rather than truncating consent.

Tracker scope or preset changes need native resume validation. Status changes, dependencies, comments and reported references are not scope edits. No repository inspection happens here. On reload, active records remain stored but read as interrupted under the new generation. No worker, report or queue is resumed or replayed. Paused records remain paused.

Publishing, merge, production, permission increases and added scope need separate approval. Whole-epic acceptance remains explicit integration evidence, not active scope or finished subtasks.

## Historical fixture boundary

The historical automated notice path failed twice after ordinary pause. The executing attempts' authorization is unknown. This release removes new agent input rather than claiming a fix. The original fixture remains paused with its gate loaded, hold and private history retained. No skill instruction authorizes resuming, rechecking, releasing, deleting rows or unloading that fixture. Any cleanup needs separate approval, actual queue inspection and verified resolution before a gate unload. Missing observations remain unknown.
