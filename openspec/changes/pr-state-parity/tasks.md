# Tasks

## 1. Persistent lifecycle in both views

- [x] 1.1 Add the shared pure PR-status presentation module and replace visibility based on blockers/actions. Verify table-driven tests for Draft with empty blockers, Draft with failed checks/conflicts, Open with blockers, actionless Open, Closed, Merged, and stale contradictory action fields; assert the source insight is not mutated.
- [x] 1.2 Wire the PR header and composer banner to the shared lifecycle result. Verify rendered tests in `ui/pr-status-rendered.test.tsx` that both consumers show the same lifecycle, Draft remains alongside higher-priority blockers without duplicate Draft text, terminal states suppress obsolete detail, and only a valid open action displays readiness.
- [x] 1.3 Preserve status-to-panel navigation and readable lifecycle text beside compact detail and action buttons. Verify keyboard activation, accessible names, no nested buttons, no GitHub write from status clicks, and existing PR-panel navigation tests.
- [x] 1.4 Update the README and plugin overview lifecycle descriptions. Verify the documented lifecycle matrix matches the rendered cases and does not claim that Closed or actionless Open is hidden.

## 2. Matching queue detail

- [x] 2.1 Move the queue presentation mapping from `ui/pr-tab.tsx` to the shared module and use it in both views. Verify all four queue states, position text, failure tone, and no merge action or blockers in queue-state tests.
- [x] 2.2 Add rendered panel/banner cases for queued, awaiting_checks, merging, and failed, including a terminal snapshot with an old queue entry. Verify a failed entry is not described only as Queued and Merging is not displayed as Merged; keep existing queue parsing and summary tests passing without contract changes.
- [x] 2.3 Update the README's queue/banner table. Verify each label, position rule, and tone against the paired rendered cases.

## 3. Loading, errors, and refresh recovery

- [x] 3.1 Render initial loading, confirmed no-PR, and first-read errors with Retry in the banner using existing insight and refresh handling. Verify delayed-load and rejection tests, retry recovery, no invented lifecycle/action, and no automatic panel opening.
- [x] 3.2 Keep the last good lifecycle/details visible with refresh progress or a failure, its original refresh time, and Retry. Handle both cached `ok` results with errors and bare transport failures after a good read in the shared insight hook. Verify stale Draft and stale Open cases, successful recovery, and clearing the retained snapshot on no-PR or thread change.
- [x] 3.3 Exercise paired consumers across Draft-to-Open, Open-to-Closed/Merged, queue transitions, realtime reload, and a late response after A-to-B navigation. Verify convergence after both consume the update, no cross-thread status/error, and no added GitHub fetch path or polling timer.
- [x] 3.4 Document loading, no-PR, last-good, retry, and brief independent-mount update behavior in the README. Verify the documentation distinguishes stale data from a confirmed current result and does not promise atomic updates.

## 4. Integrated safety and browser acceptance

- [x] 4.1 Run the complete GitHub Insight tests, `npm run typecheck`, and `npm run build` from its package. Verify shared merge/enqueue progress, confirmation, double-click deduplication, shown-head guards, palette feedback, no automatic panel opening, and no merge action for Draft or terminal states still pass; keep operation and read errors separately dismissible.
- [x] 4.2 Run the implementation workflow's required single read-only completion review after implementation and resolve its actionable findings. Verify the final changes stay within GitHub Insight presentation and tests/docs, with no RPC/summary/polling/dependency or native-suppression changes.
- [x] 4.3 Run paired PR-panel/banner browser checks at normal and compact widths in light and dark themes. Verify lifecycle readability, long-detail truncation, keyboard status/retry access, real host file controls, and an offered Mark ready control. Use owned fixtures for queue/error/terminal states and perform no real PR writes. Obtain separate approval for installed-plugin replacement or live record changes; report any existing suppression failure under BBP-113 rather than changing its CSS here.
- [x] 4.4 Deliver an acceptance record with tested source/build identity, screenshots, passed/failed/blocked/skipped checks, cleanup, and any approved installation/rollback state. Verify native desktop checks are listed as skipped unless explicitly requested and that browser evidence is not presented as proof of native behavior; leave unmet host-control acceptance visible.
