# Design

## Context

See `proposal.md` for the reason and scope. The supplied screenshots show both a wide list and a constrained split-view pane.

`views/list/row.tsx` currently switches from a three-row grid to flex at the list container's `@4xl` breakpoint. In the grid, status and title occupy row one, priority and key occupy row two, and the metadata rail is explicitly placed on row three. This causes the extra height even when a short title and one progress badge would fit in two lines. Titles currently have regular `text-sm` styling; metadata uses `text-xs`. The screenshot still has weak emphasis between the title, key, and badges.

The same `TaskRow` handles parents and subtasks. Its label popover is anchored to the title for keyboard editing, independently of the visible label chips. Thread and PR summaries already own their menus, focus restoration, aggregation, and uncertainty reporting. A single PR's existing link already shows its number and primary state.

The in-flight `task-overview-thread-pr-status` change establishes the work-state behavior. Its design names `All threads archived`, and current tests check verbose lookup explanations. This change shortens that visible wording without changing the underlying facts. The durable `task-list-subtasks` and `task-dependencies` contracts remain intact.

## Goals / Non-Goals

**Goals:**
- Make a short constrained row occupy two content lines instead of three.
- Make the title the first reading target and group related secondary information together.
- Preserve one row component, existing data ownership, and all interaction paths.
- Keep uncertainty and actionable problems readable rather than replacing text with unexplained icons.

**Non-Goals:**
- No application-wide typography reset, new fonts, colors, shadows, cards, or display settings.
- No changes to the split-view shell, filter bar, board, task details, or list-level work-status summary.
- No new status aggregation, fetching, persistence, or backend behavior.
- No fixed-height two-line clamp. Long titles and dense metadata can use more space.

## Decisions

### 1. Use a shared secondary row in constrained panels

Keep a single container-aware component tree. In the constrained layout, retain the first-line status control and title. Place priority in the control gutter and group the key and metadata in a shared, wrapping secondary line, aligned with the title's text edge. Preserve the chevron and subtask indentation.

Normal constrained case:

```text
[status] Smooth task navigation
[priority] BBP-59  0/9 subtasks
```

The metadata follows the key rather than starting a mandatory third row. A task without metadata still has its key and priority on the secondary row. Dense metadata wraps within that group. Long titles wrap above it without a line clamp. Keep the current compact single-line mode for sufficiently wide list panels; do not use the application viewport to select the mode.

Keep the current wide breakpoint initially. The failure shown in the screenshot is the forced third row, not evidence that every breakpoint must change. Verify both sides of the breakpoint before changing it.

Alternative rejected: forcing the desktop row into every pane would truncate task names and crowd controls. Separate desktop and mobile row trees would duplicate menus and keyboard targets.

### 2. Establish hierarchy with host typography

Use the existing host body step for the title with medium weight and a comfortable line height. Use the next smaller existing host step for normal-weight keys and metadata, with tabular numbers for counts. Preserve readable contrast; do not lower opacity to hide clutter. Status-group headings stay unchanged.

Retain the coarse-pointer text helpers and target sizes. Visual marks can be compact while their hit areas remain large, but targets must not overlap adjacent controls or the row-opening button. Touch rows may therefore be taller than fine-pointer rows. Do not shrink text as the number of badges grows.

Alternative rejected: larger or bolder text everywhere would preserve the weak hierarchy. Global text overrides would change unrelated screens and could defeat touch accessibility.

### 3. Remove label presentation, not label editing

Remove the row-only label chip tree, `labelsById` row prop, and the caller's lookup map if it has no remaining use. Keep `projectLabels`, the row context-menu labels submenu, the title-anchored `LabelsPicker`, and the `list.labels` keyboard action.

Audit `partitionLabels` callers across TS and TSX before removing it or its tests. Keep any helper used by another surface. No task label values or board presentation are changed.

Alternative rejected: CSS-hiding label chips at selected widths leaves a second presentation branch and does not meet the all-width removal decision.

### 4. Keep summary ownership and shorten row-facing copy

Keep thread runtime buckets and their priority unchanged. Use `All archived` or `N archived` for the visible archive phrase. Keep the fuller archive wording in the accessible description and the existing per-thread menu. Continue to display archive unavailability when archive state is unknown.

Keep the existing single-PR link and primary state. Shorten the adjacent quality control rather than rewriting the PR link or rich-detail renderer. Use short existing-state phrases such as `Details stale`, `Details unavailable`, `Details incomplete`, and `Lookup unavailable`; move explanatory counts out of the visible suffix and into the menu and accessible description. When several quality conditions exist, the compact control can use `Details incomplete` while its menu and accessible name enumerate the distinct causes. With no known PR items and unavailable lookup, keep `PRs unavailable`. Successful known items never conceal unavailable lookups or stale details.

The full lookup count must remain available from the menu itself, not only in an accessible name. If it is currently absent there, add the short explanatory entry within the existing PR popover. Keep failure and conflict priority visible. Do not edit shared aggregation or freshness rules to make a summary shorter.

Alternative rejected: hiding Idle or using warning icons alone would erase useful state or require hover. Removing missing-data warnings would falsely imply complete or successful results.

### 5. Remove empty layout space without duplicating status logic

Treat the metadata rail as an optional member of the shared secondary group. If every metadata child renders no content, hide the empty rail from layout with a scoped empty-element rule. Do not add another implementation of thread/PR availability checks to the row merely to predict what those children will render.

Loading and unavailable summaries render content, so they remain visible. The key and priority remain regardless of metadata. Preserve metadata order: progress, dependencies, threads, PRs, due date, project marker.

Alternative rejected: a second row-level availability calculation would drift from the summary components and could hide loading or unavailable state.

### 6. Verify behavior and rendered layout separately

Update existing component tests for label-free presentation, compact archive copy, and truthful PR quality controls. Test keyboard and context-menu label editing without visible chips, parent/subtask parity, summary focus restoration, and empty/loading metadata.

Use rendered checks for line grouping, typography, container behavior, and target geometry. Existing class-name assertions alone do not prove that rows are readable. Inspect list panes at approximately 360, 640, 880, and 1100 CSS pixels, including a narrow pane in a wide split-view window. Include long titles, dense thread/PR state, subtasks, loading/unavailable data, light/dark themes, fine/coarse pointers, and increased browser zoom.

Use the existing Impeccable context and host design tokens. The detector reported no layout findings on the current row, so a clean scan is not proof of good hierarchy. Build fully, inspect in one grouped round, fix the findings together, and use at most one confirmation round.

## Risks / Trade-offs

- Two content lines are not a universal height limit. Keep wrapping for long titles and dense metadata; do not hide important state to achieve a fixed height.
- Smaller secondary text can become too faint. Keep the host readable metadata step and contrast, including coarse-pointer promotion.
- Reordering grid areas can differ from keyboard order. Align DOM and visual grouping and test navigation through status, priority, labels, and summary controls.
- Shorter archive and lookup copy can break literal-text tests from the work-status change. Update row-facing expectations while retaining all state assertions and full accessible/menu descriptions. Do not shorten the list-level summary.
- Work on the same row components can overlap other active changes. Compare the checked-out implementations before applying; preserve their behavior and keep edits local to this change.

## Migration Plan

No data migration is needed. Apply row layout, label removal, and summary copy changes with their regression tests, then build the plugin. Rollback restores the previous UI code without modifying task data.

## Open Questions

None that affect scope or behavior. Fine spacing uses the host scale and is checked during the bounded rendered verification pass.
