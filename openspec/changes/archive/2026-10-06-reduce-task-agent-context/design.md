# Design

## Context

See `proposal.md` for motivation and scope. This design is required because delegation, mentions, skill selection and reporting tests share the affected behavior.

Observed behavior in this checkout:

| Entry point                                | Current context                                                                                                                                                        |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `delegate/index.ts`, `buildSeedPrompt()`   | Task/project details, blockers, subtasks, attachment manifest, five recent comments, preset/extra instructions and about 569 source-text words of report-back guidance |
| `delegate/index.ts`, `prepareTaskWorker()` | Reads comments both to collect comment-owned attachments and to select recent comment bodies                                                                           |
| `mentions/index.ts`, `buildTaskContext()`  | Task properties, description, subtasks, attachment manifest, five comments, attached threads and an action contract                                                    |
| `skills/tasks/SKILL.md`                    | About 784 words covering task work, fixed comment format, milestone cadence, parent summaries and administration                                                       |
| Existing operation references              | Separate task-record, delegation and attachment guidance already exists                                                                                                |

`reporting-test-support.ts` currently requires milestone wording, a 40-80-word target, a three-bullet format and parent-summary rules. Delegation includes a complete prompt snapshot. Mention tests require rich state and mutating command guidance. These expectations must change with the behavior; simply adding a shorter paragraph would leave the old context in place.

The current `task-progress-reporting` spec requires milestone and automatic parent-summary guidance. This change explicitly replaces those requirements. Dependency readiness and thread-link retention remain governed by their existing specs.

## Goals / Non-Goals

### Goals

- Make automatic context small, measurable and appropriate to the user's actual request.
- Keep full requirements and current state available through existing Tasks commands.
- Distinguish a task reference from an assignment without adding a new approval system.
- Preserve task-work safety while removing repeated instructions and default history dumps.

### Non-goals

- No new tool, scheduler, context service, CLI mode, database table or generated skill framework.
- No server-side filter for milestone comments and no change to notification defaults or system activity entries.
- No changes to Code Cleanup or its custom configuration.
- No deletion or replacement of orchestration runtime paths. Coordinate ordinary prompt expectations with the separate removal in `bbthread://thr_zrmcc5g9p5`.
- No promise that a language model will obey the emitted instructions or that a skill will never be selected by a provider.

## Decisions

### 1. Keep a short delegation policy and preserve explicit source content

Reduce the plugin-authored report-back policy to at most 120 whitespace-delimited words. It covers only assigned scope, current blockers, review/completion gates, useful outcome comments, relevant checks and retained task/thread links. Detailed posting mechanics belong in an operation reference.

Keep the task description, project identity, blocker list, subtasks, attachment references, preset instructions and per-dispatch instructions. Preserve the existing attachment-pending distinction if still used by the integrated baseline. Do not truncate task requirements or user instructions to satisfy a context budget.

Remove automatic epic-summary responsibilities, historical bookkeeping explanations and native reporting/capability instructions from the ordinary report-back policy. This is a prompt change, not authority to remove native tools or their records.

Alternative rejected: a configurable verbose/quiet mode. Koen requested removal, not another option that leaves unused rules active by default.

### 2. Remove recent comment bodies from worker preparation

Remove the Recent comments section and its seed-prompt input. Do not replace it with a None section or a default summarizer.

`prepareTaskWorker()` currently uses comments to collect comment-owned attachments. Retain the reads needed for that manifest; removing comment text from the prompt must not lose those files. Keep any attachment-enumeration optimization separate from this change.

The normal work instruction points to `bb tasks show <key> --json` for current requirements and blockers. Read comments only when they are relevant to the actual work, such as a requested review response or clarification. Unrelated history is not mandatory context. Failed reads remain visible; they must not be replaced by assumed state.

Alternative rejected: summarizing the latest five comments. That adds another context producer, can hide explicit instructions and does not remove historical permission confusion.

### 3. Make mention resolution neutral

Return only task identity, title, the full stored description and a short pointer to `bb tasks show <key> --json` when current details are needed. Omit the metadata dump and action contract. Preserve the existing unknown-task error and key/title search behavior, including current-project ranking.

Mention resolution must not fetch labels, subtasks, attachments, comments or linked threads merely to populate context. Keep task pills, links and `::task` cards unchanged.

The description itself is user content. Preserve any embedded references or restrictions rather than sanitizing them into a different task. The neutral wrapper provides context; it does not assign implementation or status changes.

Alternative rejected: removing mentions. They are useful references and are not the problem when their resolved context is small.

### 4. Use the existing skill/reference structure for operation-specific guidance

Keep `skills/tasks/SKILL.md` as the single small entry point, with a body of at most 250 whitespace-delimited words excluding YAML frontmatter. Narrow its description and opening guidance so a bare task reference is not presented as a work assignment.

Include only intent selection, the current-state read, applicable task-work gates, a short outcome rule, task-link retention and links to operation references. Do not require reading every reference before a read-only task question.

Reuse `references/task-records.md`, `delegation.md` and `attachments.md`. Put multiline posting mechanics and a minimal safe example in `references/reporting.md`, read only when a report is actually needed. Keep task-record creation, linked-tracker selection, pagination, dependency and notification safeguards in the task-management reference; do not weaken them to reduce the entry-point size.

Delegation and the skill communicate the same short outcome policy. They do not repeat the detailed reference. Avoid a code generator or a new runtime abstraction solely to synchronize a few sentences.

Alternative rejected: separate auto-discovered skills for every command. That enlarges the skill catalog and makes simple task requests harder to route.

### 5. Replace milestone and parent-refresh duties with outcome guidance

Default task-work guidance recommends a comment only for review readiness, completion, failure, a blocker or a user decision. Ordinary edits, commits, test runs and child state changes alone do not trigger comments or parent updates.

Keep relevant check results, important limits and a useful evidence link. Do not require word targets, fixed bullet counts or unchanged-state checklists. Preserve the distinction between worker evidence and independent verification. An outcome comment does not make unfinished integration complete.

If the user explicitly asks for a parent summary, read current state and answer that request. There is no automatic parent-summary job and no new poll, wakeup or notification. Users can still post any valid Markdown comment through the existing path.

### 6. Test actual outputs and bounded authored text

Use whitespace-delimited word counts for deterministic budgets: 120 words for delegated report-back policy, 250 for the Tasks skill body, and 60 for the authored mention wrapper. Exclude dynamic task identity/content and user preset/extra instructions. These are context-regression budgets, not total model-token limits.

Measure baseline and resulting generated outputs with fixed fixtures. The source-text estimates above are discovery evidence, not a substitute for measuring the generated prompt. Report total fixture output separately from authored instruction counts, so a small wrapper cannot hide a large included history dump.

Add large sentinel descriptions, comments, subtasks, labels, attachments, threads and preset instructions. Assert that the required content remains and omitted data is absent. Test public registered delegation and mention entry points as well as the small skill text. Confirm on-demand CLI reads still return comments and file references.

Replace formatting regexes that mandate old prose with assertions for outcome conditions, forbidden milestone/automatic-parent guidance, intent separation and safety rules. Keep the existing shell-literal example test by reading its new operation reference. Preserve comment storage/rendering and no-notification integration coverage.

## Risks / Trade-offs

- Less automatic history can hide relevant decisions. Mitigation: preserve task descriptions and explicit dispatch instructions, and direct workers to current-state reads when needed. This does not resolve ambiguous historical restrictions automatically.
- Skill descriptions influence selection but do not enforce provider behavior. Mitigation: test emitted metadata and instructions, not model compliance. No live agent starts are needed for source acceptance.
- Removing comment reads too broadly can lose comment-owned attachment references. Mitigation: cover those attachments in public delegation tests and retain the necessary enumeration path.
- Existing snapshots and regexes can keep old instructions accidentally. Mitigation: change the old expectations, check all task entry points and use forbidden-content fixtures alongside budgets.
- The orchestrator thread may edit the same seed-prompt paragraph. Mitigation: reconcile the final ordinary prompt once, preserve its separately approved runtime changes and do not recreate deleted instructions or tools.
- Budgets do not control user-written descriptions, presets, custom cleanup prompts or context from other plugins. Mitigation: state these exclusions in measurements and do not silently rewrite user data.

## Migration Plan

1. Implement the scoped source, skill and test changes on the reviewed checkout. Update README and plugin overview descriptions.
2. Run focused tests, full Tasks package checks and strict OpenSpec validation. Record before/after context measurements from fixed fixtures.
3. No schema or data migration is needed. New delegated prompts, mention resolutions and newly loaded skills use the new guidance. Previously delivered prompts, historical comments and running provider sessions are not rewritten.
4. Installation or reload of a live plugin remains a separate approval step. No installed plugin change is required to validate the implementation.
5. Roll back by restoring the previous package source/build through the normal approved deployment procedure. Stored task and comment data require no rollback. Existing sessions can retain the guidance they already received.
