# Tasks

## 1. Define the reporting guidance in the Tasks skill

- [x] 1.1 Add a focused contract test for the bundled Tasks skill covering the short format, 40-80 word target, material-limit exception, evidence references, reporting levels, and event-based parent refresh. Verify that it fails against the current vague guidance before changing the skill; avoid a whole-file snapshot.
- [x] 1.2 Add one reporting section to `bb-plugin-tasks-plus/skills/tasks/SKILL.md` and point the milestone step and related invariants to it. Include concise examples for review readiness, a blocked decision, and an epic with remaining acceptance work. Verify the contract test passes and each example makes its result, next step, and relevant limit clear without duplicating a worker report.
- [x] 1.3 Document safe multi-line posting with existing CLI arguments and supported comment links. Add a focused fixture check that preserves real newlines and Markdown through argument construction. Verify the example needs no new CLI flag and keeps existing notification, status, attachment, and task-link instructions intact.

## 2. Deliver equivalent guidance in delegated worker prompts

- [x] 2.1 Extend `bb-plugin-tasks-plus/delegate/delegate.test.ts` with report-back contract assertions for a task without children and a task with subtasks. Cover evidence placement, parent responsibility, fresh-state reads, and no automatic completion. Verify the new assertions fail before changing the prompt and retain coverage of blockers, recent comments, presets, and additional instructions.
- [x] 2.2 Replace the general report-back paragraph in `bb-plugin-tasks-plus/delegate/index.ts` with the compact reporting contract and a pointer to the Tasks skill. Preserve task-specific commands and existing artifact/status responsibilities. Verify the prompt tests and snapshot pass, and the fake-host dispatch test observes the updated contract in the actual spawn prompt.
- [x] 2.3 Check the skill and generated prompt against the same essential-rule assertions. Verify neither entry point requires orchestration, tells every child to edit its parent, changes notification targeting, or drops full handoff evidence. Record in the skill that these rules affect future instruction delivery, not old comments or previously sent prompts.

## 3. Verify the complete reporting path

- [x] 3.1 Add focused coverage using the existing CLI/API and activity/editor test fixtures for a multi-line comment with a lead sentence, bullets, and supported detail links. Verify the stored body preserves newlines and the renderer displays the intended structure. Include a longer user comment to confirm there is no new length restriction, rewrite, or truncation; keep production editor code unchanged.
- [x] 3.2 Validate synthetic reporting examples for a completed child, an old parent comment contradicted by current child state, unreadable current state, an unchanged repeated report, and all children done with epic acceptance pending. Record the expected comment or no-comment result and its evidence reference. Verify that each maps to the spec and clearly distinguish fixture/instruction checks from actual model behavior.
- [x] 3.3 Run the package's focused and full tests, typecheck, lint, and build, then strict validation of `task-progress-reporting` and whitespace checks. Verify all required checks pass or record the exact blocker, and confirm the implementation adds no runtime dependency, migration, command, automation, or UI change.
- [x] 3.4 Request approval before any installed-source change, test records, or bounded test worker. If approved, verify the packaged skill and new worker prompt, observe milestone and parent-summary behavior on owned synthetic tasks, and clean up only owned temporary state. Record expected versus observed results and model limitations. If approval or runtime access is unavailable, leave the behavioral check blocked rather than claiming that static tests prove agent compliance.
