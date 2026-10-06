# Context measurements and verification

## Fixed-fixture measurements

Counts use whitespace-delimited words, not model tokens or provider usage.

| Entry point      | Original total / authored | Updated main total / authored | Result total / authored | Authored limit |
| ---------------- | ------------------------- | ----------------------------- | ----------------------- | -------------- |
| Delegation       | 2768 / 523                | 2661 / 416                    | 800 / 109               | 120            |
| Mention          | 1995 / 122                | 1995 / 122                    | 325 / 12                | 60             |
| Tasks skill body | 765 / 765                 | 765 / 765                     | 227 / 227               | 250            |

Original base: `51520bf283d4a4486705b479e6797df51456c4ea`.
Updated main and completion-review base: `02005fda87fdd0aa7403621551b4fa5ef54cdda2`.

The generated totals include task requirements, attachment references and explicit instructions. Authored delegation counts exclude the dynamic task key and ID. Mention counts exclude the fixture's dynamic field values and description. Skill counts exclude YAML frontmatter. No user content is truncated to meet a limit.

All three versions used the same fixture in `agent-context-test-support.ts`: a long description with preserved whitespace and a scope restriction, seven long comments, a subtask, a blocker, a label, task and old-comment attachments, a prior thread and long preset/extra instructions. The old comment attachment is outside the former five-comment window.

Before measurements ran the current public-entry tests against isolated `git archive` copies of each fixed base, with the same fixture and measurement support. Those baseline tests failed as expected. The current tests pass.

Reproduce the current measurements from the repository root:

```sh
TASK_CONTEXT_MEASURE=1 npm --prefix bb-plugin-tasks-plus test -- \
  delegate/delegate.test.ts mentions/mentions.test.ts reporting.test.ts \
  --no-silent --reporter=verbose
```

## Upstream integration and scope

The user approved updating this branch to main. The update includes the separately merged Orchestrator removal from PR #127. The two overlapping delegation-policy edits were resolved in favor of the short ordinary policy and its matching snapshot. The removed pending-attachment branch, Orchestrator runtime and skills remain removed.

The change diff against the updated base contains only Tasks context source, tests, skill references and documentation. Code Cleanup source and configuration are unchanged by this change. Test storage is isolated; stored live tasks, plugin installation and active provider sessions are not modified.

## Validation

- Focused public-entry, CLI, dependency, thread-header and comment tests: 104 passed.
- Complete Tasks package suite: 1,015 tests passed in 96 files.
- Tasks typecheck and plugin backend/frontend build: passed.
- Repository lint and formatting: passed. Lint reports existing warnings in unchanged files; none are from this change.
- Strict OpenSpec validation, skill validation and Git whitespace/conflict checks: passed.
- Live installation and provider-session tests: not run. This change does not authorize deployment or modification of running sessions.

The [independent completion review](review.md) approved the change with no findings. It independently reran 29 affected tests and confirmed the 109/120, 12/60 and 227/250 authored-context counts. Broader checks and historical measurements were reviewed from this record, not independently rerun. No additional review pass was started.
