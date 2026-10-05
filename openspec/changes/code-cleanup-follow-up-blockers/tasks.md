# Tasks

The optional design document is deliberately omitted. This change uses the existing default-guidance function and test seams, with no architecture, API, or storage changes. The task-recording baseline is already in source and in `code-cleanup-settings-controls`; integrate that change before archiving this delta.

## 1. Default instructions and documentation

- [x] 1.1 Add policy assertions in `bb-plugin-code-cleanup/guidance.test.ts` for the merge prerequisite, new-ticket-blocked-by-current-ticket direction, explicit prohibition on the reverse dependency, verified keys, and missing-key or failed-write reporting. Verify the new assertions fail against the unchanged default prompt with `npm test -- guidance.test.ts` from the package directory. These tests check instruction content, not whether an agent obeys it.
- [x] 1.2 Update `defaultGuidance` in `bb-plugin-code-cleanup/guidance.ts` to tell agents to save this dependency only when the new cleanup needs the current change merged first. Keep existing tracker, duplicate-search, label, and record-only safeguards. Use CLI help for syntax rather than adding hard-coded flags. Verify `npm test -- guidance.test.ts` passes, including the existing concise-prompt and 4,096-character limits for real project IDs.
- [x] 1.3 Update the factory-behavior paragraph in `bb-plugin-code-cleanup/README.md` with the dependency direction and failure rule. Verify it agrees with the prompt and makes clear that custom prompts are not rewritten and existing sessions retain prior guidance.

## 2. Integration checks

- [x] 2.1 Run the package tests, type check, lint, and format check with `npm test`, `npm run typecheck`, `npm run lint`, and `npm run format:check` from `bb-plugin-code-cleanup`. Verify the existing `agent.test.ts` and `prompt.test.ts` checks still prove factory delivery, reset behavior, and exact custom-prompt preservation. No UI behavior changes, so browser and native checks are not required for this instruction-only change.
- [x] 2.2 Run the single read-only completion review required by the implement skill against the full implementation diff. Resolve any blocking findings and rerun affected checks. Verify no storage migration, custom-prompt rewrite, dependency change, or unrelated implementation entered the diff.
