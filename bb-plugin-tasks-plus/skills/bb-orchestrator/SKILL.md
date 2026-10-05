---
name: bb-orchestrator
description: Read an existing Tasks epic and manage explicitly approved scope records.
disable-model-invocation: true
---

# BB Orchestrator

Use this skill only after an exact explicit invocation. Read [scope controls](references/run-controls.md) for syntax, native consent and support limits.

1. Submit only the requested `begin`, `pause` or `resume` scope control with `bb tasks orchestrate <action> --request latest --json` from this coordinator thread. Begin/resume return `pending` for one native approval form. After the actual decision, make one result lookup with the same request ID. Keep pending or refused outcomes explicit.
2. Read compact epic status. Summarize task state, stored outcomes, pending questions and reported references. Mark unknown, stale and omitted information. Read [worker reports](references/worker-reports.md) when interpreting their provenance or delivery state.
3. Return the manual-first limits and any operator decision needed. Automatic dispatch, notification, answer routing, artifact delivery and integration orchestration are deferred. Worker starts, questions, artifact handoffs and integration assignments remain deliberate operator actions outside this skill.

This skill manages records only. It issues no worker input through any ordinary Tasks dispatch, `comment --notify`, thread API or substitute command. A deferred command is not permission to use another route. Scope begin/resume does not start a worker; scope pause does not stop one or cancel native queue work.

The coordinator does not inspect repositories or worker transcripts, implement, test, review, integrate or diagnose failures. Report the need for an operator-assigned owner instead. Task totals and idle workers are not epic acceptance. Run approval does not approve publication, merge, production or new scope. Only the actual user submits native consent where required. Chat agreement is not a submitted form; BB-recorded user classification is not independent human-identity proof. See BBP-51.
