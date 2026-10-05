# Design

## Context

See `proposal.md` for the observed comment problem and agreed scope.

- `skills/tasks/SKILL.md` asks for substantive milestone comments and relevant validation, but supplies no common format or length target.
- `delegate/index.ts` builds each worker's initial prompt through `buildSeedPrompt`. Its report-back section is one general paragraph. Task context, recent comments, preset instructions, and additional instructions remain separate sections.
- `delegate/delegate.test.ts` already checks the complete prompt with an inline snapshot and exercises real dispatch through the fake plugin host.
- `views/activity/task-activity.tsx` passes comment bodies to the read-only `TasksEditor`. The editor already supports Markdown lists, paragraphs, and links. The observed single paragraphs were present in stored comment bodies, not introduced by this renderer.
- Current task reads expose subtasks and dependency state. A completed child, an idle worker, and completed epic acceptance are separate facts.
- The separate `bb-orchestrator` change owns coordinator routing, durable reports, and artifact handoffs. The present comment notification route targets the latest responding agent, not necessarily a parent coordinator.

A design is included because the two instruction entry points must agree, and parent freshness needs an explicit boundary between reporting guidance and automation.

## Goals / Non-Goals

**Goals:**

- Make the default agent update understandable without opening the thread.
- Keep full evidence available to reviewers and downstream workers.
- Make the reporting rules work for both delegated workers and agents that load the Tasks skill.
- Improve parent summaries when their existing owner handles new information.

**Non-Goals:**

- No current-state panel, comment collapsing, renderer change, or generated summary service.
- No comment validator, length rejection, database migration, new RPC, or new CLI option.
- No new coordinator, parent notification route, polling loop, automatic task transitions, or subtask creation.
- No edits to task history, acceptance text, running threads, or stored user presets.

## Decisions

### 1. Put the reporting policy in the skill and a compact contract in the worker prompt

Keep the complete policy and examples together in a reporting section of `skills/tasks/SKILL.md`. Point the work sequence to that section rather than scattering repeated prose through the skill. Put task-administration details behind explicit branch-specific links; use CLI help for command syntax.

Replace the general report-back paragraph in `buildSeedPrompt` with a compact, self-contained version of the same essential rules. Keep task-specific command guidance and attachment/status responsibilities. Point to the Tasks skill for examples and the fuller workflow. Preserve surrounding prompt sections and caller-supplied instructions.

The skill is the policy reference. The prompt repeats only the essential contract because delegated workers must receive it even if skill discovery does not load the full document. Focused tests must cover agreement on format, evidence placement, cadence, and reporting level. There is no need for a new runtime Markdown loader or prompt-template framework.

Alternatives considered:

- Skill-only instructions leave a worker's seed prompt vague.
- Prompt-only instructions miss agents working on manually attached tasks.
- Loading policy files dynamically adds packaging and runtime failure cases to a small text change.

### 2. Treat brevity as a writing target, not a data restriction

Use one short result or state sentence, a blank line, and up to three flat bullets. A bold lead sentence is suitable for examples. Aim for 40-80 words; shorter updates are valid. If a material limit cannot fit, disclose it rather than silently omitting it. Leave long supporting evidence in the thread or an attachment.

The comment should answer the relevant questions, not fill mandatory empty fields:

- What changed, or where does the work stand?
- What happens next?
- What blocks progress, needs a decision, or limits confidence?

For completion or review readiness, include a brief check outcome. Distinguish focused checks from full acceptance and worker-reported checks from independent verification. Prefer a readable reference over opaque identifiers. Keep exact commit and baseline data in the handoff so downstream work loses no information.

The skill should show a safe multi-line CLI example using existing argument handling. Its body must contain real line breaks and survive shell quoting. Use the existing supported task/thread link forms in comment examples; do not assume chat-only task-card directives render inside task comments.

Alternatives considered:

- A strict server-side word cap could reject useful user text or hide safety limits.
- A long fixed template would produce empty sections and repeated boilerplate.
- Reformatting old comments would alter history and still require uncertain summaries.

### 3. Assign summary responsibility without adding automation

An agent responsible for an epic reports overall progress. A worker reports its own subtask. Handling a child completion, changed blocker, or user decision is the parent's opportunity to refresh its summary using current task state. Several related results can produce one parent comment.

Before a parent comment, read current parent and relevant child state through existing task reads. Count only `done` children as done, consistent with existing progress counts. Keep canceled work, dependency readiness, worker activity, and whole-epic acceptance distinct. If state is unreadable or conflicts with a report, state the limit rather than presenting an unsupported count or completion claim.

Do not tell every worker to edit the parent. This avoids duplicate summaries and competing ownership. A worker uses only the already authorized handoff or communication path. The reporting policy does not reinterpret `comment --notify` as coordinator delivery, add new wakeups, or require transcript investigation by coordinators.

This is not a live summary guarantee. A parent comment remains a dated observation until its owner handles another relevant event or user request. An idle or absent owner does not gain an automatic updater.

Alternatives considered:

- Having every child post to the epic creates duplicate and conflicting updates.
- Refreshing on a timer adds automation outside the agreed scope.
- Storing a second current-state document risks disagreement with task state and belongs with the deferred UI option.

### 4. Verify instructions and the existing comment path separately

Extend prompt tests to check the reporting contract with and without subtasks and to preserve all existing context. Add a focused skill-text contract check using the repository's test tooling so the two instruction entry points cannot silently lose essential guidance. Avoid a broad snapshot of the whole skill.

Use small synthetic examples for a normal milestone, completion with review pending, a blocker/decision, a long evidence report, a stale parent comment, and an epic awaiting acceptance. Check the rules against each example. Use existing CLI/API and activity/editor test fixtures to demonstrate that multi-line bodies retain their line breaks and render bullets and supported links. Keep production editor code unchanged.

These checks prove that the guidance is delivered and that the existing comment path can display it. They do not prove that every model will follow it. A bounded installed-worker check can evaluate actual output after explicit approval for the test worker and owned test records. Record blocked checks honestly and do not use live user tasks as test fixtures.

## Risks / Trade-offs

- Agents can ignore instructions. Mitigation: concrete examples, a self-contained worker contract, and an approved behavioral check. Do not claim runtime enforcement.
- Short comments can omit important limits. Mitigation: require the blocker, decision, or acceptance limit in the visible summary, even when detail moves elsewhere.
- The skill and prompt can drift. Mitigation: one policy section, a small prompt summary, and tests for their essential rules.
- Parent text can become stale between events. Mitigation: fresh reads before each summary and an explicit lack of automatic refresh. A live summary panel remains deferred.
- Concurrent orchestration work can touch the same prompt builder. Mitigation: preserve its report and handoff fields; keep human-facing brevity separate from machine-useful evidence.
- Existing threads retain old prompts. Mitigation: document that installation changes future instruction delivery, not past messages.

## Migration Plan

No data migration or new dependency is needed. After implementation and local checks, package the updated skill and prompt through the normal plugin build. Any live installation change or test worker requires the applicable approval and a defined cleanup scope.

Verify both the packaged skill and a newly generated worker prompt. Retain a short report of sample behavior and any limitations. Roll back by restoring the previous plugin build; task records and old comments remain untouched. Rollback does not remove instructions already delivered to a worker.
