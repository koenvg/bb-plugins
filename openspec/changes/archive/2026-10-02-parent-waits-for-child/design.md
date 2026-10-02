# Design

## Context

`tabFor(thread, pr)` in `tabs.ts` sees one thread. `visibleItems` in `list-model.ts` filters with it and holds the full thread list. Child threads link to their parent with `parentThreadId`. The SDK gives no count of running children.

## Goals / Non-Goals

**Goals:**
- Compute "has an active descendant" from the thread list the list already gets.
- Keep `tabFor` a pure function that is easy to test.

**Non-Goals:**
- No change to row state, row cues, or the Needs you group in All.
- No change to how child rows nest in a tab.

## Decisions

- **Pass a boolean, not the thread list.** `tabFor(thread, pr, hasActiveDescendant)`. `visibleItems` computes the flag once per render. Alternative: pass all threads to `tabFor`. Rejected: each call walks the tree again, and tests need full trees for simple cases.
- **Walk up from each active thread.** Build a `thread -> parentThreadId` map over all threads. From each active thread that is not archived and not hidden, walk up and mark every ancestor. Archived or hidden threads in the middle do not stop the walk, so a grandparent still sees its active grandchild. A per-walk visited set stops cyclic parent references. Alternative: stop at an ancestor that is already marked. Rejected: with a cycle, it can skip an ancestor.
- **Active descendant uses the own-signal predicates.** Active is `isBusy || hasActivity || queuedWork !== "none" || needsAttention` from `row-cues.ts`. Unread and PR status are left out, so a finished child does not hold its parent.
- **Rule position.** The flag check goes after the own busy/background/queued rule and before the `!pr` rule.

## Risks / Trade-offs

- [A parent with a stuck child stays in In flight forever] -> The child itself shows its state. The user sees it in In flight or Needs attention.
- [Child that is not loaded in the sidebar list] -> It does not count. The parent falls back to its normal rules, which is today's behavior.
