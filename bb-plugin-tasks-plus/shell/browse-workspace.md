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
the existing keyed `DetailView`. Confirmed absence requests safe clearing. If a
loaded ticket disappears while saving, its originating editor remains mounted
until clearing succeeds, including failed-draft retry.

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
Compact mode hides rather than unmounts the list and provides a basic safe Back
to list action. Selection and resize do not focus an editor.

`ShortcutOwner` is a narrow prerequisite for mounting both existing shortcut sets.
A pane registration only runs when focus belongs to that pane; visible list
movement also retains the old unfocused-panel default. Existing global editing,
modifier, composition, overlay, and outside-panel guards are unchanged.

- BBP-13 owns ongoing selection reconciliation after filtering, collapse, edits,
  refresh, deletion, and scope changes, including staging list context mutations.
- BBP-14 owns preview movement, Enter/Escape focus transfer, selected-row focus
  rules, ordered paging, and updated shortcut help. Existing j/k still move row
  focus until that slice; they do not invent a separate selected index here.
- BBP-15 owns complete compact Back/focus/resize/context restoration and theme
  acceptance. The current Back flag is workspace-local and deliberately small.

Local markup fixtures and SDK tests do not establish installed-host routing,
scroll/focus behavior, removal of the old Navigation tab, or SDK compatibility.
