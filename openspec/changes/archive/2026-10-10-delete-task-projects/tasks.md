# Tasks

Acceptance conditions are in `specs/tasks-project-settings/spec.md`. Technical decisions are in `design.md`.

Each delivery includes the tests and documentation it requires. Before acceptance, the owner checks completion evidence and applicable project validation and review requirements.

## 1. Compact, accessible project row actions

- [x] 1.1 Replace row text actions with check-mark Save, undo Cancel and separated destructive trash Delete icons using existing components and dependencies. Update action-specific sizing and heading guidance. Verify existing Save/Cancel behaviour, accessible names, tooltips and 36px targets in `views/manage/projects-section.test.tsx` without changing the name/colour editor.
- [x] 1.2 Extend the existing production fixture preview with the three row icons and confirmation entry point. Inspect an early desktop and narrow-panel preview with the user before final acceptance tests; record feedback and preserve the agreed table layout. Update `scripts/project-settings-preview/README.md` so the actions and preview steps match the delivered UI.

## 2. Prefix-confirmed deletion dialog

- [x] 2.1 Add the responsive confirmation dialog bound to saved project identity, name and prefix, leaving unsaved drafts untouched. Include the permanent-deletion warning, retained BB workspace/threads statement and text-labelled dialog actions. Verify opening, Cancel, Escape, initial Cancel focus, focus return and independent drafts with project-settings component tests.
- [x] 2.2 Load the complete project task count through the existing paginated `listAllTasks` helper without active/status/parent filters. Add loading, zero and error states with manual Retry and disabled deletion until a complete count is known. Verify multiple pages, completed tasks, subtasks, count failure and results arriving after dialog dismissal in component tests.
- [x] 2.3 Require exact case-sensitive prefix equality, reset input on each opening and keep the final action disabled for blank, incorrect, case-mismatched or space-padded values. Verify that a correct value enables but does not itself submit deletion, and that reopening requires a fresh confirmation.
- [x] 2.4 Update the fixture preview to exercise correct/incorrect prefixes, zero tasks and count failure/retry. Document prefix confirmation, count semantics and the unchanged BB resources in the preview README and the Tasks README; verify the documented flow matches the preview.

## 3. Safe deletion through the existing API

- [x] 3.1 Extend the existing synchronous table-wide mutation guard to cover save and delete. Submit `deleteProject` with the confirmed ID and `force: true` only after inventory readiness, identity membership, count readiness and prefix checks. Interpret domain failures and `deleted: false` explicitly. Verify duplicate activation, cross-row save/delete exclusion and stale inventory prevention in component tests.
- [x] 3.2 Block edits, confirmation changes, duplicate submission and dialog dismissal while deletion is pending. Keep control dimensions stable, and preserve typed confirmation and drafts on failure for manual retry. Verify pending, transport failure, domain failure and retry states in component tests without automatic recovery.
- [x] 3.3 Reconcile confirmed deletion locally so the row disappears immediately and overlapping inventory reads cannot restore it. Close and announce success, move focus to a surviving action or the Projects heading, and retain unrelated drafts. Verify successful deletion, an overlapping stale read and a failed post-delete refresh with component tests; update fixture behaviour and preview documentation for these states.
- [x] 3.4 Extend `views/manage/projects-section.integration.test.tsx` using the real API/store to delete a populated linked project through its confirmation UI. Verify all statuses and nesting levels are removed, other Tasks projects and the linked BB workspace/threads remain, and project choices refresh. Run existing API attachment-blob deletion coverage and project persistence tests. Document permanent deletion and the absence of restoration in the Tasks README.

## 4. Full-change verification and acceptance

- [x] 4.1 Run the Tasks package tests, typecheck, lint, format check and plugin build using the repository's documented Node/npm tooling. Record commands, results and limits, and rerun checks affected by later edits. Confirm the existing name/colour, task identity and inventory regressions still pass.
- [x] 4.2 Inspect the finished production fixture on desktop and a narrow panel, in light and dark themes, with keyboard and touch-size checks. Verify icon tooltips, focus, readable destructive warning, typed-prefix gating and stable pending layouts. Follow Impeccable's bounded verification and detector instructions; record the user's visual feedback and any checks not run.
- [x] 4.3 After validation, follow `/Users/koen/.pi/agent/skills/code-review/SKILL.md` for one independent read-only review of the complete implementation. Resolve blocking findings, rerun affected checks and record acceptance evidence. Do not deploy, publish or delete real user projects during verification.
