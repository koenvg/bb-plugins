# Design

## Context

See `proposal.md` for the user problem. Starting commit: `8c1933440a5afe08570ab6232f61048adc50bf5e`; the working tree had no local edits before this proposal.

`ThreadList` in `bb-plugin-pr-thread-list/app.tsx` receives `activeThreadId`, but currently uses it only to mark the selected row. Its memoized `visibleItems` call does not receive selection or placement history.

`list-model.ts` owns the forest, eligible tree membership, natural tab priority, grouping, and flattened rows. `buildForest` already handles descendants at every depth, hidden parents, and cycles. The current `tree-tabs.test.ts` verifies that clearing unread output moves a working tree to In flight. The main `sidebar-thread-tabs` spec explicitly requires that immediate move. The delta retains that behavior for unselected trees and adds the selection exception.

A design is needed to settle ownership and update ordering: selection can arrive in the same host update as an unread-to-read change or work completion. The hold must retain either attention tab, not just Needs attention.

## Goals / Non-Goals

**Goals:**

- Keep one selected tree's placement stable without freezing its data.
- Resolve selection through the same forest and eligibility rules used by the list.
- Handle combined selection/signal updates before rendering, not by restoring a disappeared row later.

**Non-Goals:**

- No persisted hold, unread-state workaround, timers, manual pin action, or new preference.
- No hold for every open split pane. Use the existing active selection supplied by `activeThreadId`.
- No fixed row position. Existing sorting may move rows within their group.
- No changes to All-tab grouping, natural thread/PR priority, snooze storage, server services, or dependencies.

## Decisions

### 1. The sidebar owns temporary history; the list model owns classification

Keep the held tree identity, its captured tab, and the previous committed classification snapshot in the mounted `ThreadList`. Expose only the small list-model operation needed to derive natural tree placement and apply an optional held root/tab pair to the list. Share the existing forest, eligible membership, and `tabOfTree` logic rather than creating a second classifier in the component.

The hold affects only tab filtering. Current thread objects still supply rows, nesting, group counts, indicators, and actions. The held root belongs to its captured tab, Needs attention or In flight, and is excluded from the other attention tab. All ignores the override for grouping.

Alternative rejected: `needsAttention || selected` without history. That would pull an already In flight tree into Needs attention on selection. Mutating `isUnread` would also falsify read markers and stored thread state.

### 2. Resolve the effective hold on every relevant update

Use current loaded, non-hidden forest relationships to find the selected tree. Only an active, non-hidden, non-snoozed selected member can keep a hold. Reuse the existing root identity, including loaded context ancestors, rather than following a separate parent chain.

For each update:

1. Release the old hold if selection is absent, excluded, removed, or no longer in that tree.
2. Preserve the root/tab pair when selection moves between eligible members of the same tree, regardless of current signals.
3. When selection enters an eligible tree, capture that tree's natural tab from the previous committed snapshot, if it contains the matching tree and eligible selection. This keeps placement stable when selection and a signal change arrive together. Resolve that match through tree identity and eligible members, not row visibility or scroll position.
4. If there is no matching previous placement, capture the tree's current natural tab. On a fresh mount, this means current signals determine placement.
5. Apply the effective hold to current tab filtering before rendering rows, then retain the current natural classification snapshot for the next transition. Do not store overridden placement as natural history.

Do not use a post-render effect as the only placement correction, since that can commit a render with the tree absent. Use React-safe state/history handling; a discarded render must not become committed placement history.

Once selection leaves, current natural rules decide placement immediately. Selecting that tree again captures its current placement, not a remembered old hold. New unread output, approvals, errors, work completion, or PR changes update indicators but do not switch a held tree's tab.

Alternative rejected: intercepting only row clicks. Selection can change through keyboard navigation, a PR badge, or other BB navigation. The host selection prop is the source of truth.

### 3. Eligibility and current data remain authoritative

Archive, hide, removal, and successful snooze take precedence over a hold. Do not preserve a stale row list or old attention signals. An excluded selected member cannot hold an awake sibling's tree through a dimmed context row.

A tab change alone does not release a hold while the sidebar remains mounted and the same tree stays selected. This is presentation state, not a new saved preference. All continues to use real signals for its Needs you group; the other attention tab does not duplicate the held tree. A remount or reload starts with no history and uses natural placement.

Alternative rejected: freezing the flattened rows. That would keep stale membership and hide ongoing work or PR updates.

### 4. Verify at existing public boundaries

Extend `tree-tabs.test.ts` through the public list derivation to verify placement, nesting, and exclusivity. Preserve the current no-hold cases, including work outranking PR problems and excluded members not contributing signals.

Extend `app.test.tsx` through the SDK slot harness to cover host selection and sidebar-data updates in both directions, including combined selection/read and selection/completion updates. Use observable rows and indicators rather than testing component state. Reuse the existing Vitest and jsdom setup; no new browser-test dependency is needed.

Before final checks, inspect a working BB sidebar preview with a parent, working child, and unread child. In Needs attention, read the output, navigate among family members, then select another tree. In In flight, select a working tree and let its work finish or an attention signal arrive, then select another tree. Confirm that each tree remains in its captured tab until selection leaves and that all indicators remain accurate.

## Risks / Trade-offs

- A combined selection/signal update can hide the tree before a hold is recorded. Mitigation: retain the last committed natural placement and test combined and separate host updates in both directions.
- The override can accidentally duplicate a tree across tabs. Mitigation: apply one effective tree tab and assert exclusivity at the list boundary.
- Holding old rows can defeat snooze or lifecycle filters. Mitigation: hold only placement, rebuild current membership, and test exclusions through the slot.
- A held In flight tree can need input or contain unread output. This is the approved trade-off: show current attention indicators and restore natural placement as soon as selection leaves, without adding notifications or changing signal priorities.
- A reload can move a previously held tree to the other tab. This is intentional because selection holds are not durable state.

## Migration Plan

No data migration is required. Build and install the updated `bb-plugin-pr-thread-list` through the existing plugin workflow. Existing preferences remain valid. Rolling back the frontend code restores immediate natural reclassification without rewriting stored data.
