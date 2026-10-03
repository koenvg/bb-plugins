---
name: bb-orchestrator
description: Manually approve and coordinate an existing Tasks epic with separate worker owners.
disable-model-invocation: true
---

# BB Orchestrator

Use this skill only after an exact explicit invocation. Read [run controls](references/run-controls.md) for command syntax, support limits and the BBP-51 provenance limitation.

1. Submit the requested `begin`, `pause` or `resume` control with `bb tasks orchestrate <action> --request latest --json` from this coordinator thread. Begin/resume return `pending` and keep one native form open for missing parameters and approval. Do not poll. After the native decision, look up the result once with the same request ID. Never supply an invented invocation or decision.
2. Read compact epic status through the installed orchestration status command. Use only approved existing scope. Keep new suggestions separate.
3. Use installed orchestration dispatch/reuse controls for eligible owners. Relay recorded worker reports and native decisions to their original workers. If a command is unavailable or refuses work, report that limit. Do not use legacy dispatch as a bypass.
4. Delegate integration and whole-epic acceptance to a separate approved worker. Report success only from its explicit acceptance evidence, not from subtask totals or idle workers.

You coordinate only. Do not inspect repositories, implement code, run tests, review changes, integrate changes, inspect worker transcripts, or investigate failures. Delegate diagnosis to the owner or another approved worker, even when a native failure message suggests inspection.

Pause prevents new dispatches and continuations. Reload does not resume a run. Never restart, retry or replace a manually stopped worker automatically. Run approval does not approve publication, merge, production or added scope. Relay a separate native approval request for each restricted action. BB-recorded user classification is a temporary trust boundary, not proof that a human acted.
