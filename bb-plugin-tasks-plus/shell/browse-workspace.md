# Browse workspace contract

The shell mounts `BrowseWorkspace` for All, Active, and project-list destinations.
It keys the workspace by scope, never by selected ticket. The existing shell's
`TasksSessionProvider` stays mounted across all in-panel destinations.

## Selection and navigation

The accepted browse route's optional `taskKey` is the committed identity.
`requestSelection` puts URL replacement inside `session.request(commit)`. It
reveals Ticket on the request, not after a delayed save. It uses the host navigator inside that callback, not
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
later Escape return, collapse, or filter from consuming the session's latest-destination slot and
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

The main Tasks slot owns the full-width list. `ticket-panel.tsx` registers one
flush native Ticket fixed tab; BB owns the surrounding pane, tab strip, resizing,
and compact drawer. Browser and Terminal remain host tabs, not plugin controls.
There is no inner split, width threshold, or plugin Back-to-list composition.

BB mounts fixed tabs in separate React trees and unmounts inactive tabs. The tab
is an outlet only: the workspace keeps one stable portal container and moves its
DOM into that outlet, or into a hidden/inert parking node when no outlet exists.
The editor never changes React ownership, so it retains its TasksSessionProvider,
write barrier, query identity, title/description editor, and task-owned drafts.
Closing the Tasks page removes the portal and releases session retention; closing
only the native tab does not. The bridge keeps outlet/content references only for
their mounted lifetime; it is not a second task store or router.

`onPendingTransition` reveals an originating parked editor before guarded writes.
A failed save can then show its existing Retry controls. Revealing on selection
request rather than save completion prevents a later Browser/Terminal switch from
being undone. Route-driven selection still reveals Ticket; same-key refresh and
resize do not. A declined host open shows the same retained editor in a temporary
main-page recovery view, without first requiring its failing save to succeed.
Native placement can be retried; returning to the list remains guarded.

The first native outlet owns the editor. Additional outlets show a Show ticket
here action rather than stealing it on mount. Explicit activation transfers the
same container; owner disposal hands it to the oldest surviving outlet.

ShortcutProvider registers the portal as an additional scope under its single
listener. Hidden/inert/disconnected scopes are ineligible. Pane visibility also
closes responsive overlays so a parked editor cannot leave a menu in document.body.
`ListView.visible` remains a scroll-measurement signal for other consumers, not a
readiness input. The native composition leaves the list visible and mounted.
Filters, sort, expansion, scroll, and scope retain their existing owners.

Rows use their list container width, wrap titles and metadata below 672px, and give
row status/priority/expansion controls 44px coarse-pointer targets regardless of
viewport width. These classes are list-only; board and detail layouts are untouched.

## Keyboard and focus

`browse-keyboard.ts` registers workspace movement, Enter/open, Escape, and ordered
paging with the existing definitions and listener. Controlled ListView omits its
legacy focus-only movement handlers. Property handlers still use `ShortcutOwner`;
the list additionally requires the focused row to equal the committed selection.
Only `s`, `p`, and `l` overlap between list/detail definitions, and their owners are
focus-exclusive regardless of registration order. Hidden/inert roots are ineligible.

Movement uses only settled `onVisibleOrderChange({ keys, settled })` reports and
committed selection. It rechecks current order inside the accepted save callback.
No selection starts at the first row; ends clamp and empty/unsettled lists do
nothing. Split pager buttons and brackets use this order. Standalone TaskPager and
board registration are unchanged.

Focus intent is armed inside `request(commit)`, never by awaiting the transition's
shared boolean promise. The accepted route must match before focus moves. Explicit
Enter/open waits for `DetailView.onReady` and matching `data-detail-key` markup,
then focuses the non-editable pane root. Loading, retryable errors, and returning
to a previously loaded key have keyed tests. New requests cancel old focus intent;
editor, overlay, and outside-pane focus block delayed focus. Movement focuses
and scrolls the selected row. Escape saves and restores row focus with preventScroll.
Selection/open and deferred Escape share `canRestoreBrowseFocus`; an accepted
return consumes its intent even when another control owns focus. A native tab
switch does not steal focus from another pane or restore it into parked content.
Neither selection nor resize focuses an editor.

Retained removal rows remain unsettled and cannot supply a keyboard destination.
Context changes keep the reconcileRevision contract above. Comment records still
belong to the one mounted TasksSessionProvider.
Retention ends when the Tasks page/session closes, not when its native tab closes.
No browser-reload or cross-device persistence is promised.

Local markup fixtures and SDK tests do not establish installed-host routing,
scroll/focus behavior, removal of the old Navigation tab, or SDK compatibility.
