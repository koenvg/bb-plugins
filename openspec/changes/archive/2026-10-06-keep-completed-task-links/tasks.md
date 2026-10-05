# Tasks

## 1. Keep agent guidance consistent

- [x] 1.1 Add focused assertions in `bb-plugin-tasks-plus/reporting.test.ts` and `delegate/delegate.test.ts` for keeping links after completion or handoff and detaching only after an explicit user removal request. Include the task-record repair reference and both attached and attachment-pending seed prompts. Verify the new assertions fail against the current guidance before changing it.
- [x] 1.2 Replace automatic-detach guidance in `skills/tasks/SKILL.md` and `skills/tasks/references/task-records.md`, add equivalent retention guidance to the report-back contract in `delegate/index.ts`, and update the README's detach examples and explanation. Verify the new focused guidance tests pass and none of these public documents still authorizes detach merely because work finished, failed, changed, or was handed off.
- [x] 1.3 Document the guidance-only rollout limit in the README: new prompts and newly read skills use the rule, but old prompts and detached data remain unchanged. Verify the documentation also preserves manual detach and does not claim retained links grant new ownership or reporting authority.

## 2. Verify completion and explicit removal at public boundaries

- [x] 2.1 Extend the delegation/API integration tests to dispatch or attach a worker, set its task to Done through the public update path, and read both task-thread listing and `getTasksForThread`. Verify both still return the same association and the Done task, without a second dispatch or detach.
- [x] 2.2 Extend the existing explicit-detach integration test to detach a completed task on request. Verify the association is removed, the task remains Done, and no thread-stop or task-status mutation is issued by detach.
- [x] 2.3 Extend `views/thread-header/thread-header.test.tsx` to render an initially Done task and open it, then cover removal of the only link through the existing realtime refresh. Verify Done remains visible and clickable, compact accessible naming stays correct, and the chip disappears only after the link is removed. Keep the existing live status-transition test.

## 3. Check the complete change

- [x] 3.1 From `bb-plugin-tasks-plus`, run `npm test -- reporting.test.ts reporting.integration.test.tsx delegate/delegate.test.ts api/api.test.ts views/thread-header/thread-header.test.tsx`, then `npm run typecheck` and `npm run build`. Verify all checks pass and review the diff for unintended API, schema, ownership, or header-layout changes.
- [x] 3.2 Record the passed checks and coverage limits in the implementation handoff. Verify the handoff identifies that the installed Tasks Plus plugin uses a separate local source copy, that installed behavior is unverified unless a separate deployment/verification step is authorized, and that no production links, old prompts, or task histories were repaired or rewritten.
