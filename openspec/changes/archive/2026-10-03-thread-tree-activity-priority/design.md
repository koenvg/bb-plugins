# Design

## Context

See `proposal.md` for motivation. Individual-thread classification in `tabs.ts` already checks direct attention and unread output before activity, and checks activity before PR problems. The mismatch occurs in `visibleItems` in `list-model.ts`: after collecting a tree's eligible members, it selects Needs attention whenever any member satisfies `pullsTreeToAttention`. An idle child's PR problem therefore wins over another member's work.

The existing spec scenario "Child PR problem pulls the tree" and the corresponding `list-model.test.ts` expectation explicitly require that old behavior. This change replaces that expectation, rather than treating it as an accidental regression.

A design is included to settle the classification boundary and the distinction between work signals and PR waiting states before implementation.

## Goals / Non-Goals

**Goals:**
- Express the tree-wide order at the point where complete member information is available.
- Reuse existing attention, activity, and idle-PR rules without duplicating blocker lists.
- Keep signal evaluation limited to eligible members, not display-only ancestor rows.

**Non-Goals:**
- Changing individual-thread classification, PR badge presentation, PR summary fetching, or refresh intervals.
- Splitting a tree across tabs or changing grouping, sorting, collapse state, persistence, or snooze storage.
- Treating checks running or review pending as thread work. These remain PR fallback signals.

## Decisions

### Select a tree's tab in three ordered stages

At the existing tree-selection boundary in `list-model.ts`, evaluate the collected eligible members in this order:

```text
any member has needsAttention or unread output --> attention
any member has active work                    --> inflight
otherwise                                     --> existing idle/PR tree fallback
```

The first stage uses `needsAttention` plus `isUnread`. After it fails for every member, the existing `isActive` predicate can identify work without mistaking approvals, unread errors, or failed queued messages for work: those states were already handled by the first stage. Alternatively, a small work predicate can reuse `isBusy`, `hasActivity`, and waiting queued-work state if that makes the order clearer. Do not infer work from spinner presentation or PR blockers.

Keep the classification as a named, focused tree decision rather than extending the per-member boolean with unrelated conditions. The fallback retains the current top-member and child-PR-problem behavior, including failed merge queue entries and settled children that do not pull the tree.

Alternative rejected: make conflicts alone a special case. The same mismatch exists for failed checks, requested changes, unresolved comments, and failed queue entries. The agreed rule covers all PR-only attention reasons.

Alternative rejected: move activity ahead of unread output. That would hide user-visible attention signals and differs from the approved priority.

### Evaluate only eligible tree members

Use `Tree.members` for the new attention and work scans. The existing membership filter excludes snoozed, archived, and hidden threads in the attention tabs; `Tree.rows` also contains display-only ancestors and must not be used for classification. Preserve the eligible top-member fallback when the displayed root is a snoozed or archived context row. Ensure any descendant activity passed to fallback classification cannot reintroduce excluded work.

Alternative rejected: a global "some thread is busy" flag or scans of rendered rows. Those would let unrelated or excluded threads change the tree's tab and would make collapse or viewport state affect classification.

### Keep the decision derived from live inputs

Recompute placement from member signals and current PR summaries through the existing list derivation. Do not add saved classification state or new polling. When the last eligible working member stops, existing idle-PR rules regain control on the next state update.

Leave badge rendering unchanged. A tree in In flight can still show a red Conflicts badge; the badge reports PR state, while the tab reports whether the user needs to act now.

## Risks / Trade-offs

- A PR problem may be unrelated to the currently running work. Mitigation: preserve its badge and return the tree to Needs attention as soon as work stops. This is the intended tree-wide trade-off.
- `isActive` includes direct attention signals. Mitigation: check all direct signals before using it as a work test, and cover approvals and errors during work in tests.
- Context rows or excluded descendants could accidentally contribute work. Mitigation: use eligible members and test snoozed, archived, and hidden work separately.
- Existing tests encode the old precedence. Mitigation: replace the contradicted expectation and retain idle-problem, unread, settled-child, and nesting regression cases.

## Migration Plan

No data migration or preference reset is needed. Ship the classification and documentation changes together. Rollback restores the previous classifier; stored state is unchanged.
