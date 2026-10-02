# Tasks

## 1. Normalize thread and PR observations

- [ ] 1.1 Add a Tasks-local work-status module with an injected SDK/store/clock seam and normalized read-only response types; verify its contract tests accept empty and mixed observations without changing existing TaskThread or TaskPullRequest contracts.
- [ ] 1.2 Implement current thread hydration with independent execution, archive, removed, and unavailable states; verify table-driven tests cover starting/working/idle/error, archived failures, deleted/not-found threads, unknown archive state, and cached completed attachments whose SDK thread is still idle.
- [ ] 1.3 Implement version 1 GitHub Insight metadata validation and quality classification; verify producer-shaped fixtures cover fresh/stale open and draft summaries, old terminal summaries, malformed fields/timestamps, refresh errors, unsupported versions/blockers, and additive merge queue fields without false Ready results.
- [ ] 1.4 Implement PR identity reconciliation and lifecycle fallback rules; verify tests cover shared URLs, equal PR numbers in different repositories, conflicting observations, newer host lifecycle state, authoritative absence, and metadata for a different environment PR.
- [ ] 1.5 Implement pure aggregate presentation with counted runtime/archive summaries, one primary bucket per distinct PR, preserved secondary conditions, bounded overflow, and visible problems/incompleteness; verify mixed working/failed/archived and failing/review/merged fixtures produce the agreed labels.

## 2. Deliver bounded read-only enrichment

- [ ] 2.1 Add and register listTaskWorkStatus with validated task IDs and a 500-ID maximum, returning normalized per-task records; verify API contract tests cover empty, invalid, duplicate, unknown, and oversized ID inputs with explicit results/errors and no side effects.
- [ ] 2.2 Implement deduplicated thread/metadata reads and environment PR fallback lookups with concurrency capped at eight and shared in-flight requests; verify SDK call-count tests cover the same thread or environment attached to multiple tasks and repeated batch chunks.
- [ ] 2.3 Handle optional GitHub Insight availability and partial failures independently; verify API tests retain successful thread/PR results when plugin detection, a metadata read, or an environment lookup fails, and standalone Tasks Plus still returns basic lifecycle information.
- [ ] 2.4 Add read-only regression coverage at the handler seam; verify enrichment leaves task workflow, attachment records, archive fields, and external PR/review state unchanged and existing per-task thread/PR RPC tests still pass.

## 3. Load and refresh visible list metadata

- [ ] 3.1 Replace per-row listTaskThreads fan-out in useTaskListMeta with batch enrichment for the displayed parent/subtask IDs, chunking large sets; verify list-loader tests show no enrichment for hidden rows and no comment or attachment/media lookups.
- [ ] 3.2 Wire existing Tasks invalidation/manual refresh, a 60-second mounted-list fallback, reconnect refresh, scope-safe responses, and request coalescing; verify fake-timer tests update archived/runtime/PR changes, ignore previous-scope responses, avoid overlapping loads, and clean up on unmount.
- [ ] 3.3 Preserve honest loading, retained-result quality, and partial-failure display; verify a failed refresh cannot keep an expired Ready result, a missing integration cannot imply Ready, and initial loading cannot imply confirmed no PR.

## 4. Render summaries and accessible drill-down

- [ ] 4.1 Replace ActiveChip with separate bounded thread and PR summary controls in the existing metadata rail; verify row-metadata tests cover empty attachments, mixed counts, all/mixed archived states, single/shared/multiple PRs, problem prominence, stale details, and unavailable results.
- [ ] 4.2 Add thread and multiple-PR drill-down using existing overlay primitives and BB/GitHub navigation; verify interaction tests cover identities, all simultaneous blockers, associated threads, touch/click access, individual links, and no accidental task opening.
- [ ] 4.3 Integrate summary controls with row keyboard and menu behavior; verify keyboard tests cover activation, Escape/focus return, navigation suppression while overlays are open, task editing, subtask expansion, and ordinary row-open behavior.
- [ ] 4.4 Adjust wide/intermediate/narrow metadata layout to preserve the title, archive cues, and problem labels without horizontal overflow; verify dense-row screenshots or a minimal browser preview early, then mobile-layout tests and visual checks in light, dark, and a third-party BB theme.
- [ ] 4.5 Verify status parity across All tasks, project lists, active-work lists, and filtered/dimmed parent/subtask trees; add focused regression cases to list/subtask tests showing task workflow and existing filters remain unchanged.
- [ ] 4.6 Update the Tasks README with summary examples, optional GitHub Insight requirements, archive/freshness semantics, and drill-down interactions; verify the examples match tested labels and do not promise board changes, new filters, or automatic completion.

## 5. Validate the integrated change

- [ ] 5.1 Run Tasks Plus npm test, npm run typecheck, npm run lint, and npm run build after all edits; record pass/fail results and resolve affected regression failures without expanding into unrelated cleanup.
- [ ] 5.2 Verify installed behavior with and without GitHub Insight for mixed attachments, archived threads, partial lookup failures, multiple PRs, and a mounted overview receiving updates; record acceptance evidence, lookup counts, and any unavailable real-world PR fixtures.
- [ ] 5.3 Complete the implement skill's single fresh-context read-only completion review against the full implementation diff; resolve blocking findings and rerun verification affected by fixes before declaring implementation complete.
