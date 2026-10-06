# Tasks

## 1. Short delegation context

- [x] 1.1 Add public delegation tests with large sentinel comments and explicit description/preset/extra instructions. Capture baseline generated-context measurements. Verify the new absence and 120-word policy assertions fail against the current prompt while existing execution, blocker and attachment expectations remain covered.
- [x] 1.2 Shorten `buildSeedPrompt()` and remove the recent-comment input/section without adding a summary. Preserve complete task requirements, preset/extra instructions, status/link gates and comment-owned attachments in `prepareTaskWorker()`. Verify `delegate/delegate.test.ts` passes, excluded reporting duties are absent and the authored policy is at most 120 words.
- [x] 1.3 Update the README delegation section to describe short outcome guidance and comments read only when needed. Verify it no longer promises recent-comment injection or intermediate milestone updates and still documents manual delegation and thread-link retention.

## 2. Lightweight task mentions

- [x] 2.1 Add mention-provider tests for large descriptions and omitted properties, labels, subtasks, files, comments and threads. Assert a neutral read pointer, no mutating action contract, a wrapper of at most 60 words, unchanged search ranking and the existing unknown-task error. Verify the changed-context assertions fail against the current resolver.
- [x] 2.2 Reduce `buildTaskContext()` to identity, title, full description and a neutral current-detail pointer; remove reads used only for omitted context. Verify `mentions/mentions.test.ts` passes and descriptions with explicit restrictions or embedded references remain intact.
- [x] 2.3 Update the README mention section to distinguish task context from task-work authorization. Verify existing task-pill/card navigation coverage stays green and documentation no longer claims a bare task key assigns work or requires tracked-task mutations.

## 3. Small skill entry and outcome reporting

- [x] 3.1 Revise `skills/tasks/SKILL.md` and its description to separate read-only intent from assigned work and keep the body within 250 words. Reuse existing operation references and add `references/reporting.md` for safe multiline posting only when needed. Verify all reference links resolve and current blocker, relevant-attachment, status and explicit-detach safeguards remain represented.
- [x] 3.2 Replace old milestone/word-target/bullet-template/automatic-parent assertions in `reporting-test-support.ts`, `reporting.test.ts` and delegation expectations with outcome-policy, intent and context-budget assertions. Move the shell-literal example test to its operation reference. Verify reporting and delegation tests pass without tests pretending to prove model compliance.
- [x] 3.3 Update `PLUGIN_OVERVIEW.md` and the applicable README agent guidance to describe review/completion/failure/blocker/decision comments rather than milestone progress. Verify no task entry point retains mandatory intermediate comments or automatic epic-summary duties; leave Code Cleanup and orchestration runtime documentation unchanged.

## 4. Integrated acceptance

- [x] 4.1 Exercise registered delegation, mention resolution and on-demand CLI reads with the fixed fixtures. Verify omitted history remains readable, old comment-owned attachments remain available, user content is not truncated, task links are retained, and reads/comments cause no unintended worker input or status changes. Run `reporting.integration.test.tsx` and the relevant CLI, dependency and thread-header regressions.
- [x] 4.2 Record a concise before/after measurement artifact for generated delegation, mention context and the skill body, separating total fixture words from authored-policy words. Verify the 120/60/250 budgets, state their user-content exclusions and reconcile ordinary prompt expectations with the separate orchestrator-removal result without restoring removed runtime behavior.
- [x] 4.3 Run the complete Tasks package tests, typecheck, lint, build and diff checks, plus `openspec validate reduce-task-agent-context --strict`. Verify only scoped source, skill, tests and documentation changed; no Code Cleanup settings, stored records, live plugin installation or active provider sessions were modified.
