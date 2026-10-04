# Design

## Context

See `proposal.md` for motivation and the delta specs for the user contract. This design is needed because section visibility affects saved preferences, rendered row order, editor selection, and scroll restoration.

`ListView` currently renders a static sticky header and all entries for each status group. `list-preference.ts` saves filters and sort in a versioned localStorage document with `all`, `active`, and `project:<id>` scopes. It validates input and avoids overwriting future versions. Subtask expansion has separate persistence in `expanded-tasks.ts`.

`selection-tree.ts` retains the previous rendered tree while the editor resolves a selected row's removal. `visibleTreeTasks` feeds visible order and row metadata. `ListView` also uses `onRequestContextChange` to stage changes until task edits save. Browse-workspace tests already cover successful and failed saves during subtask collapse.

## Goals / Non-Goals

Goals:
- Keep saved preferences and their recovery in the existing preference module.
- Keep one rendered-tree definition of visibility for rendering, selection, and keyboard order.
- Reuse editor save protection rather than add a second selection or navigation mechanism.

Non-goals:
- No server preference endpoint, database migration, cross-device sync, or new dependency.
- No generic disclosure framework, list virtualization, bulk collapse control, or board changes.
- No redesign of task selection or subtask expansion.

## Decisions

### Extend the existing scoped preference document

Add a sanitized `collapsedStatuses` list to each `ListPreference`. Reuse `listPreferenceScope` and the current storage key. Keep the version 1 document compatible through an additive field. Missing fields load as an empty list, which means all sections expanded. Accept only known task statuses and remove duplicates using the module's existing validation pattern.

Preference updates must preserve all other fields. In particular, the current filter and sort setters reconstruct preferences, so they must preserve section choices. Clearing filters must not clear collapse state. Retain saved statuses even when their sections have no current rows. A storage failure leaves mounted state usable; unknown future versions remain read-only on disk.

Alternative: a new storage key and persistence module. Rejected because the scope, validation, version handling, and failure rules already exist at the preference module's interface. Session-only storage is also insufficient for app restart.

### Make the entire header a native button

Replace the static header with a full-width native button, retaining the existing sticky, opaque background and `data-status-group-header` marker. Include a small disclosure chevron before the status icon, label, and existing count. Use `type="button"`, `aria-expanded`, a status-specific accessible name, visible focus styling, and existing touch-target support. Do not add a separate chevron click target.

Keep the header mounted when collapsed. Do not render its rows while collapsed, so hidden tasks and menus cannot receive focus. Use the same layout at narrow and wide panel widths. Header activation must not open a task, change its status, or reach a task keyboard shortcut handler as a row action.

Alternative: a clickable `div` or a small chevron-only control. Rejected because a native full-width button provides keyboard behavior and a larger touch target without custom key handling.

### Carry section state in the rendered tree

Add section visibility to the rendered group model. Keep entries and counts available in collapsed groups, but make `visibleTreeTasks` omit those entries. Rendering and visible order must use the state in the tree returned by `useSelectionTree`, not a separate preference lookup. This ensures that a retained tree remains internally consistent during selection reconciliation.

Do not remove entries before grouping or change the task matching query. Section counts still use included parents and the filter bar still uses matches. Subtask expansion runs as before; an expanded parent inside a collapsed section becomes visible only when its section opens. Row metadata work can continue to follow the visible task set.

Alternative: hide rows only in JSX or CSS. Rejected because it would leave hidden tasks in visible selection order or mounted focus targets. Removing all group entries is also unsuitable because it loses the header count and confuses an all-collapsed list with an empty result.

### Commit toggles through existing context-change protection

Pass section state changes and persistence through `onRequestContextChange`, as existing filters, sort, and subtask toggles do. Do not save a collapse before that callback accepts it. After an accepted collapse hides the selected task, use the existing unavailable-selection reconciliation to clear detail. Preserve the prior tree and draft when saving fails, then complete the queued change after a successful retry.

Focus must end on the visible section control after collapse. Test focus after reconciliation as well as immediately after activation, so delayed editor work cannot leave focus in removed rows. A selected task in another section remains selected.

Alternative: keep hidden selections indefinitely or clear detail directly in the header handler. Rejected because the current workspace treats accepted visibility changes as selection removal and already protects pending edits.

### Restore section state before scroll position

Load the scope's section preferences with its filters and sorting. Include scope transitions in the existing readiness checks, so the previous scope's collapsed state cannot become a settled visible order for the new scope.

Scroll restoration must recognize a settled list of collapsed section headers as content-ready even when it has zero visible task rows. Use a section-layout revision signal so changing section visibility can update restoration without depending only on visible task count. Preserve the existing clamp to the available scroll range and hidden-pane checks.

Alternative: leave readiness tied to `visibleTasks.length > 0`. Rejected because an all-collapsed list still has valid content and must restore without waiting for a task row.

### Test through existing preference and UI interfaces

Use the preference module's load, store, and sanitize interface for storage cases. Use accessible header buttons and rendered task keys for list interaction tests. Extend browse-workspace reconciliation tests for selected parents, selected children, failed saves, and retries. Preserve existing test fixtures and do not introduce a new app-wide state adapter.

## Risks / Trade-offs

- A filter can match hidden tasks. Mitigation: retain explicit collapsed chevrons and truthful header and filter-bar counts; filters never silently override saved choices.
- A preference setter can erase the new field. Mitigation: use field-preserving updates and test sort, filter, clear, and scope navigation with saved collapse choices.
- A retained selection tree can disagree with section preferences. Mitigation: render controls and rows from the same returned tree and test failed-save and retry paths.
- All-collapsed sections can expose scroll and empty-state assumptions. Mitigation: test header-only readiness, navigation return, and scroll clamping.
- Device storage can fail or be cleared. Mitigation: tolerate errors, keep interaction usable, and use expanded defaults. Persistence cannot be guaranteed when storage is unavailable.

## Migration Plan

No data migration is needed. Existing version 1 preferences remain readable and load expanded sections until the user makes a choice. Ship with preference and UI tests, then run the plugin checks and a narrow-panel browser check.

Rollback restores the previous UI. The additive preference field is safe for the prior reader to ignore. A prior build can discard that field on a later preference write, so rollback does not guarantee preservation of section choices. Task data and subtask preferences remain unchanged.
