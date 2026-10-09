# Tasks

Acceptance conditions are in specs/thread-task-panel/spec.md. Technical decisions are in design.md.

Each delivery includes the tests and documentation it requires. Before acceptance, the owner checks completion evidence and applicable project validation and review requirements.

## 1. Open the thread's linked task from the Task launcher

- [x] 1.1 Add slot integration tests in views/embed/embed.test.tsx for no-param task selection, multiple linked tasks, Done tasks, and restored no-param tabs; run the focused test file and confirm the new linked-task cases fail before implementation.
- [x] 1.2 Resolve missing or empty task keys using the existing getTasksForThread lookup and its first result in views/embed/index.tsx, without backend changes or mutations; verify the selection tests pass and the shown key, details, and Open in Tasks target agree.
- [x] 1.3 Keep nonempty explicit keys on the existing path; add tests for a key that differs from the thread's linked task, an invalid key, and a missing task, and verify no thread lookup gates or replaces those targets.
- [x] 1.4 Document the Task launcher's linked-task default and first-linked selection in bb-plugin-tasks-plus/PLUGIN_OVERVIEW.md; verify the wording matches the passing slot tests.

## 2. Show lookup feedback and preserve task edits

- [x] 2.1 Add test-first coverage for delayed initial lookup, no linked task, failed lookup, and manual retry; implement accessible loading, clear empty copy, and error/Retry feedback, and verify those slot tests pass.
- [x] 2.2 Reuse task/thread invalidation and reconnect handling for default panels while keeping existing details stable during refresh; test a link added to an empty panel, reconnect refresh, and failed background refresh with visible Retry and retained detail.
- [x] 2.3 Route selection changes through the existing save barrier without remounting the active editor; test successful save-before-switch and failed save retention, and rerun the existing explicit-key switch and Open in Tasks save tests.
- [x] 2.4 Document the no-linked-task and manual retry behavior beside the launcher description in PLUGIN_OVERVIEW.md; verify the copy distinguishes an empty result from a lookup error.

## 3. Verify the actual launcher and existing entry points

- [x] 3.1 Run the focused embed and thread-header suites, plugin typecheck, and repository lint/format checks for affected files, then build the plugin; record commands, results, and any checks not run.
- [x] 3.2 With authorization for the live plugin check, select Task in BB's right-side launcher on a linked thread and confirm it opens the same details as the header chip; also check a thread with no linked task and an explicit message-card link. Record evidence and whether the originally reported blank screen is resolved. Do not claim full acceptance if the live check cannot run.
