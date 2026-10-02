# Browse workspace contract

The shell mounts `BrowseWorkspace` for All, Active, and project-list destinations.
It keys the workspace by scope, never by selected ticket. The existing shell's
`TasksSessionProvider` stays mounted across all in-panel destinations.

## Selection and navigation

The accepted browse route's optional `taskKey` is the committed identity.
`requestSelection` puts compact visibility and URL replacement inside
`session.request(commit)`. It uses the host navigator inside that callback, not
another guarded navigation call. Nesting `request` inside an in-flight accepted
callback can leave a destination queued. Remembered scope remains exclusively
owned by `useBrowseRoute`, downstream of the shell's `useSafeTaskTarget`.

Initial route selection waits for a settled visible list. `validatedKey` records
that validation, not another focused or pending selection. Detail lookup stays in
the existing keyed `DetailView`. The list then reports ongoing removal through
`onSelectionUnavailable(key, stillUnavailable)`. The workspace requests clearing
through the existing session and rechecks that predicate inside the accepted
callback. A newer loading, failed, or restored snapshot cannot clear selection.
List and detail confirmations of the same removal produce one route replacement.

`onRequestContextChange(commit)` stages filters, sort, expansion, preference
writes, and row edits behind the same barrier. It never calls guarded navigation
inside an accepted callback. Scope changes still use the shell's accepted route.
A failed save leaves the original controls, selected row, and editor available.
Each accepted non-selection context commit increments `reconcileRevision`, passed
to list and detail. Their effects then re-evaluate confirmed absence. This keeps a
later Back, collapse, or filter from consuming the session's latest-destination slot and
silently losing an earlier removal condition. Failed commits do not increment it,
so reconciliation cannot create an automatic failed-save retry loop. Explicit
selection and destination changes still win; they do not trigger this signal.

The shell only accepts empty project inventory after a successful settled result.
If a browse selection exists, it keeps that outlet mounted and passes `noProjects`
to the workspace instead of replacing the editor. The workspace requests safe
clearing; the shell shows its no-project state only after the route accepts it.
The list's `scopeUnavailable` flag marks these retained rows as unsettled.

For server-driven removal, `views/list/selection-tree.ts` retains the last rendered
grouped tree containing the committed key until the shell accepts clearing.
It does not cache queries or choose a replacement ticket. While retained, the
reported order is unsettled. A newer result restoring the row releases the tree
and invalidates a pending removal. Detail similarly retains its originating
editor and rechecks confirmed absence before clearing.

`TaskLinkNavigationContext` is scoped to the embedded detail. Existing subtask,
parent, and dependency navigation uses it through `useTasksNavigation`. A visible
key requests in-place selection. Other keys use the unchanged standalone adapter.
The detail header's explicit standalone action bypasses this context. Board,
standalone detail, and thread embeds have no task-link override.

## List boundary

`ListView` accepts `selectedTaskKey` and `onRequestSelection`. It never changes a
controlled selection itself. `TaskRow` marks its open button with `aria-current`
and keeps a selected fill independently of focus.

`onVisibleOrderChange({ keys, settled })` reports keys from the same grouped tree
used to render rows, including dimmed parents and expanded children. An unsettled
report is a snapshot, not evidence of removal. Loading, failed queries, pending
row writes, unresolved label filters, and changing scope cannot report settled.
For All/Active saved label-name filters, this includes a successful current
project inventory. Label and task query results carry their input identity, so a
retained result cannot become settled in the render before changed inputs fetch.
The list retains filters, sort, expansion, counts, row actions, and scroll storage.

## Composition and follow-ups

The shell measures its main panel before paint and observes it with ResizeObserver.
At 880px, the workspace uses a minimum 320px list and flexible detail. Each pane
has its own constrained scroll area. The editor's own container chooses inline
properties or its internal rail. There is no external property rail or splitter.
Compact mode hides rather than unmounts both panes. Its sticky Back to list action
runs through `session.request(commit)`, changes only presentation, and focuses the
current selected row with `preventScroll`. A failed Back leaves detail accessible.
A newly accepted route selection opens detail; Back never owns a second identity.
Both pane roots use `hidden` and `inert`. A layout effect moves focus only out of a
pane being hidden, or after explicit Back, to a non-editable detail root or the
selected row. Widening preserves focus; neither direction autofocusses an editor.
`ShortcutOwner` remains the sole pane shortcut gate. BBP-14 can reuse these roots
for explicit keyboard focus actions without changing the route identity.

`ListView.visible`, default true, is a measurement signal, not query readiness or
selection reconciliation. Its scroll hook defers hidden restoration, cancels queued
scroll writes when hidden, and restores the last visible offset before Back focus.
Do not feed visibility into settled-order reports. Filters, sort, expansion, and
scope remain owned by the retained list and accepted shell route.

Rows use their list container width, wrap titles and metadata below 672px, and give
row status/priority/expansion controls 44px coarse-pointer targets regardless of
viewport width. These classes are list-only; board and detail layouts are untouched.

`ShortcutOwner` is a narrow prerequisite for mounting both existing shortcut sets.
A pane registration only runs when focus belongs to that pane; visible list
movement also retains the old unfocused-panel default. Existing global editing,
modifier, composition, overlay, and outside-panel guards are unchanged.

- BBP-13 supplies ongoing reconciliation and staged list context changes. The
  BBP-14 contract remains `onVisibleOrderChange({ keys, settled })`; keys always
  match rendered rows. Use only settled reports for movement and ordered paging.
  Retained origin rows during a blocked removal are deliberately unsettled.
- BBP-14 owns preview movement, Enter/Escape focus transfer, selected-row focus
  rules, ordered paging, and updated shortcut help. Existing j/k still move row
  focus until that slice; they do not invent a separate selected index here.
- BBP-15 completes compact Back/focus/resize/context retention. BBP-13 overlap is
  bounded to workspace presentation, the ListView visibility prop, and README.
  It adds no removal-producing context staging or visible-order reconciliation.
  Task-owned comment records still live in the one mounted TasksSessionProvider.
  Retention ends with that session; no closure/reload persistence is promised.

Local markup fixtures and SDK tests do not establish installed-host routing,
scroll/focus behavior, removal of the old Navigation tab, or SDK compatibility.
