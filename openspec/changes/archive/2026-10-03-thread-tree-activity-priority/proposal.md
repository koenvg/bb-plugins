# Proposal

## Why

An idle child's PR conflicts can put an entire thread tree in Needs attention even while another member is working and nothing is unread. The list should distinguish work still in progress from work that requires the user's attention.

## What Changes

- Decide a tree's tab by checking direct attention signals first, then work in progress, then the existing idle-thread and PR rules.
- Keep the whole tree in In flight while any eligible member runs, has background work, or has queued work waiting, even if another member has PR conflicts or other PR problems.
- Keep approvals, requests for input, unread output, unread errors, and failed queued messages in Needs attention, even when another member is working.
- Reapply existing PR rules when the last working member stops, without a reload.
- Preserve PR problem badges, nesting, snooze exclusions, and All-tab behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sidebar-thread-tabs`: Change tree-level priority so work in progress outranks PR-only attention reasons across the tree, while direct attention signals remain highest priority.

## Impact

- `bb-plugin-pr-thread-list/list-model.ts`: Tree-level tab selection.
- `bb-plugin-pr-thread-list/tabs.ts` and `row-cues.ts`: Existing attention and activity predicates may support tree classification; individual-thread behavior stays unchanged.
- `bb-plugin-pr-thread-list/list-model.test.ts` and nearby classification tests: Replace the existing expectation that an idle child's PR problem always pulls a running tree into Needs attention, and add priority and transition coverage.
- `bb-plugin-pr-thread-list/README.md`: Explain the new tree-wide order.
- No API, dependency, persistence, or PR badge changes.
