# List input identities

`ListView` keeps the accepted task key in its caller. It does not keep another
selected index. Its rendered tree remains authoritative for visible order,
including dimmed parents, expanded children and retained rows during failed saves.
The order effect reports changed keys or settled state, and replays to a new
report callback. Selection alone does not report the same order again.

## Agent activity and row layout

Agent execution is separate from task status and thread archive state. The UI calls
persisted `working` execution **Running**. Idle agents stay quiet; failure,
unavailable metadata and removed threads do not become idle.

The activity summary uses the same visible tasks returned by `useListControls` as
its metadata subscription, including retained rows. Collapse and filter changes
therefore update counts and observations together.

The Task column groups project color (when shown), key and name in that order.
Compact/coarse layouts keep that identity group and a secondary metadata line.
Wide fine-pointer panels at 64rem align the remaining metadata columns. Long keys
stay bounded without hiding the marker or covering names and controls.

The running badge has a theme-colored moving edge and activity bars. Animations
pause offscreen or while the document is hidden. Reduced motion keeps static state
labels and the edge; no animation is required to identify a running agent.

## Assembly owners

`useListData` owns scoped preferences, query readiness, optimistic writes, lookup
maps, filtering, sorting and expansion. It supplies a candidate tree, not accepted
selection. Its settled flag still waits for route/scope queries, label inventory
and pending writes.

`ListView` applies `useSelectionTree` before rendering. Selection stays in the
caller, and retention stays in `selection-tree.ts`. `useListControls` uses only
that rendered tree for keyboard controls, section focus, live metadata, scroll
restoration and visible-order reports. Retained trees never report settled order.

Neither hook memoizes its whole result. Rows receive the original task, map values,
pending state and action callbacks as explicit inputs. Do not depend on the hook
result object's identity or replace these inputs with callbacks that read refs.

## Row inputs

Rows use ordinary shallow React memoization, without a custom comparator.
Callers must replace changed task, project, metadata, label collection and progress
objects. Do not mutate a previously published object or array in place. Reuse an
unchanged input reference where its owner can do so. There is no deep-equality
filter for live observations. New thread/PR observations, including freshness and
availability changes, still reach the row.

The list binds row actions by task key. Callback dependencies include each action
input and expansion entry. New selection and context actions are not hidden in
refs. The next click or edit uses the current action. Expansion and property writes
still cross the caller's save barrier.

The cheap row wrapper owns selection, pending appearance, the open button and
expansion button. Memoized row contents own property editors, date output and
thread/PR summaries. Memoized context-menu contents keep their explicit edit,
label and task inputs. A new open action can update cheap wrappers without
rebuilding unchanged menus or metadata. Ordinary selection with unchanged actions
updates the old/new wrappers. Opening an editor or receiving changed data still
updates the affected contents. No editor lifetime or native Ticket portal changes.

## Dates

Two fixed `en-US` formatters serve month/day and month/day/year output. Date-only
values parse at local midnight. `formatDueDate` still accepts a reference `Date`;
its default is the current date on each call, not a module-level current year.
Invalid values retain the former `Invalid Date` output.

The list passes a local reference-date string to rows on every list render. This
makes a date change, including New Year, meaningful to shallow memoization, even
for an otherwise unchanged row. Context-menu presets use that same reference date.
There is no date-string cache or midnight polling. An idle list updates on its next
existing render, as before.

## Repository checks and remaining gate

`render-work.test.tsx` exercises real rows and the public list with 100 tasks. It
counts date operations and rows whose semantic status input is read, not jsdom
latency. `row-inputs.test.tsx` checks current actions, task/label edits, live
thread/PR updates and unsettled pending writes. `date-work.test.ts` checks formatter
construction/use, local parsing, supplied references and year rollover.

These counts do not establish a browser speed-up. BBP-62 still needs an approved,
matched before/after browser run. The historical BBP-60 run is not paired evidence
for changed live sources. Keep BBP-50 compact draft loss and BBP-124's unconfirmed
metadata/retirement audit separate. The repository-only Oxc alignment leaves the
historical benchmark files unchanged. Their lint and format diagnostics still
block the full Tasks integration gate. Scoped checks are not a waiver.
