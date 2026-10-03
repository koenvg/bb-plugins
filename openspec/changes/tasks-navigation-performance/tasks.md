# Tasks

## 1. Native source prerequisite and benchmark baseline

- [ ] 1.1 Identify and integrate the repository commit containing the installed native Ticket composition into the implementation branch without editing the deployed snapshot or another worktree; verify `browse-workspace.tsx`, `ticket-panel.tsx`, the save session, and native-pane tests exist, record the source commit, and stop if the prerequisite cannot be established.
- [ ] 1.2 Add an owned benchmark dataset and runner for the design's 100-task fixture, ten-task warm window, 50-comment heavy-activity case, and 1440×900 viewport; verify fixture ownership/cleanup, task-identity assertions, frame-aligned timing, and classification of warm, cold, failed, and save-pending samples.
- [ ] 1.3 Record a pre-optimization baseline with both plugins enabled, at least 30 warm movements, and a separate CPU/timeline trace; deliver a report with source/bundle identities, median/p95/worst latency, blank intervals, long tasks, date work, and request counts, and document the exact rerun and cleanup commands beside the runner.

## 2. Quota footer work isolation

- [ ] 2.1 Extend `footer-adapter.test.ts` with unrelated task-DOM mutations and counters for reconciliation/visibility reads, coalesced relevant bursts, ancestor visibility, late mount/replacement, and queued disposal; verify unrelated-change tests fail on the current adapter while existing modal-menu, accessibility, ambiguity, navigation, and cleanup tests remain effective.
- [ ] 2.2 Restrict target discovery and reconciliation to quota-relevant sidebar/lifecycle/ancestor changes, preserve idempotent writes, and guard queued work after disposal; verify all adapter regressions pass and unrelated task mutations produce zero visibility reads.
- [ ] 2.3 Document the observer lifetime and relevance rules beside the adapter, run quota `npm test`, `npm run typecheck`, and `npm run build`, and record the same browser benchmark after this stage; verify fallback access and native footer activation remain intact before attributing any measured improvement to this change.

## 3. Stable list rendering and date output

- [ ] 3.1 Add date-format regressions for current/other years, local date-only parsing, and year rollover, plus row work-count tests for selection-only changes and live task/metadata/label/pending-write changes; verify the current selection path demonstrates redundant work without relying on jsdom timing.
- [ ] 3.2 Reuse date formatters, stabilize row inputs and callbacks, memoize unchanged rows, and prevent unchanged visible-order reports from causing selection-driven render loops; verify only the old/new selected rows perform selection-only row work and all semantic row updates still render.
- [ ] 3.3 Document list input-identity expectations beside the list modules, run list keyboard, expansion, sorting, scroll-restoration, work-status, and date tests, and append paired browser results; verify displayed dates and settled visible order match the pre-change behavior.

## 4. Bounded task-preview reuse

- [ ] 4.1 Add module-interface tests for normalized keys, matching-key in-flight sharing, 32-entry/2 MiB retention limits, oversized-task handling, two-call speculative concurrency, selected-read priority, eviction, invalidation generations, reconnect/manual refresh, failures, and disposal; verify the tests establish the cache contract before integration.
- [ ] 4.2 Implement the session-owned preview module and share current project/label/preset inventory reads within the session without retaining authoritative thread/PR lifecycle claims; verify module tests pass and resource invalidation neither crosses an RPC binding nor lets old responses become current.
- [ ] 4.3 Hydrate keyed detail from matching preview data and warm only the previous/next keys in the current settled visible order; verify A-to-B-to-A has no intermediate empty description, cold failure offers retry, older responses cannot replace the selected task, and scope/filter/collapse changes stop obsolete speculation.
- [ ] 4.4 Document retention limits, request priority, invalidation, and unmount behavior beside the preview module, and run detail edit/save/draft/removal and thread-embed tests; verify cached availability cannot bypass a failed save or overwrite local edits, then append the browser benchmark for this stage.

## 5. Accepted-selection readiness and native pane calls

- [ ] 5.1 Add workspace and native-panel tests for a settled visible destination, initial/unsettled validation, already-visible Ticket selection, closed/parked Ticket reveal, deferred save completion after a tab switch, and Enter/Escape focus intent; verify both accepted identity and host-call counts are asserted.
- [ ] 5.2 Remove the redundant selection-readiness gap and repeated host open calls for an already-visible matching Ticket outlet while keeping the accepted route and save barrier authoritative; verify no cached/stale list validates removal, explicit selection still reveals Ticket when needed, and a delayed read/save cannot reopen another tab or steal focus.
- [ ] 5.3 Update the native `browse-workspace.md` contract for readiness and reveal rules, run workspace readiness/keyboard/safety/reconciliation and native Ticket lifecycle tests, and append paired browser results; verify typing, composition, overlays, modifiers, and outside-pane focus still block navigation shortcuts.

## 6. Dependency candidates on demand

- [ ] 6.1 Add detail dependency tests showing no complete task-catalog read while browsing, one shared demand load for the two pickers, explicit loading/retry states, invalidation, cross-project choices, and stale-response protection after a task switch; verify the eager read fails the new no-picker test.
- [ ] 6.2 Move candidate loading behind picker-open state without delaying existing dependency links or changing exclusion/cycle rules; verify Add blocker/Add blocked task, link removal, cycle errors, and blocked-work confirmation still pass, and ordinary navigation issues no candidate-catalog read.
- [ ] 6.3 Document demand loading and retry behavior in the detail documentation, run dependency UI/API tests, and record catalog-request counts during the paired navigation fixture; verify requests occur only when the picker is actually requested.

## 7. Batched activity data

- [ ] 7.1 Add store and API tests for a task-scoped comment-attachment metadata read and additive `getTaskActivity` contract, including attachment ownership, comment order, system comments, removed/unavailable authors, empty activity, and errors; verify the expected output uses existing metadata fields and does not expose attachment bytes or other tasks' files.
- [ ] 7.2 Implement the task-scoped attachment query and activity RPC using the existing author/provider enrichment, then switch the activity hook from per-comment attachment calls to the batched response; verify 0-, 1-, and 50-comment fixtures use one activity RPC and preserve display/notification-target behavior.
- [ ] 7.3 Document the additive read and its error states in the API/detail documentation, run activity, API, DB, CLI comment, notification, and attachment regressions, and measure the heavy-activity case; verify existing `listComments` and `listAttachments` callers remain compatible and metadata failure is not displayed as absence.

## 8. Deferred activity editors

- [ ] 8.1 Add editor-construction and activity-access tests for a below-fold section, scrolling into view, keyboard activation, explicit comment focus, task changes, and native tab parking; verify the current eager path demonstrates unnecessary editor creation before initial description presentation.
- [ ] 8.2 Defer the activity's rich-text editor mounting until section visibility or explicit activation, keep a keyboard-reachable entry point and stable section position, and activate before fulfilling comment-focus intent; verify complete comments remain reachable and A-to-B-to-A preserves drafts/staged files without submitting or notifying.
- [ ] 8.3 Document deferred activation in the activity/detail documentation, run composer, keyboard, attachment, draft, and editor tests, and append initial-preview and scrolled-feed measurements; verify the optimization does not create a separate Markdown renderer or retain editors under another task identity.

## 9. Installed integration and acceptance evidence

- [ ] 9.1 Run `npm test`, `npm run typecheck`, and `npm run build` in both packages, Tasks `npm run lint`, and quota `npm run test:bundle`; verify required checks pass before proposing live replacement and record absent checks as absent rather than passed.
- [ ] 9.2 Record each plugin's current installed source, enabled state, and bundle, obtain approval for any specific source replacement, and activate only the approved builds; verify the running bundles belong to the changed source and preserve the user's Tasks data and other plugin state.
- [ ] 9.3 Run the paired final benchmark with both plugins enabled and at least 30 warm movements, then exercise cold load, invalidation, eviction, rapid repeats, heavy activity, native compact drawer/tab lifecycle, failed reads/saves, and draft ownership; deliver passed/failed/blocked results for the specs, including the 100 ms warm p95 target, and do not claim a fix if the required budget or safety checks fail.
- [ ] 9.4 Complete the cross-module completion review required by the implementation workflow, resolve actionable findings, rerun affected checks, and remove only owned benchmark records/browser resources; verify cleanup and publish the final source/enabled state, evidence report, and rollback instructions without overwriting concurrent user changes.
