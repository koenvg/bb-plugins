# Task preview retention

`TasksSessionProvider` mounts `TaskDataProvider` once per page or thread detail
session. It owns a `createTaskPreviews` instance for that session's RPC binding.
The accepted route, pending-edit barrier and task-owned comment records keep their
existing owners. Returning to A after B reads A's current snapshot synchronously.
It does not wait for a repeated lookup or retain A's old editor tree.

## Limits and reads

- Retain at most 32 positive task snapshots and 2 MiB of UTF-8 serialized task
  JSON. Count the complete task, including its description and dependency fields.
  The two limits apply together. Invalidation does not exempt stale data from them.
- Use least-recently-used eviction. A selected read touches its retained entry.
  Evict unselected entries first. If all entries are active, drop a retained copy
  rather than exceed the budget. An active query/form can still hold its own data.
- A task larger than 2 MiB can load in the active query, but it is not retained.
  Switching away releases that query snapshot. A later visit reads it again.
- Normalize keys with trim and uppercase. A request is shared only for the same
  normalized key and current generation. Reject a positive response whose key
  does not match. Reads never select a task, open a tab or change focus.
- Store task data only. Editors, draft patches, staged files, comments,
  attachments and current thread/PR lifecycle responses do not enter this cache.
  There is no adjacent preloading in BBP-63. BBP-64 owns its queue and limits.

`read(key)` returns a stable snapshot. `subscribe(key, listener)` holds only the
active query snapshot and releases it when the last listener leaves. `load(key)`
shares a matching issued request or resolves from current retained data. It is
not a complete-tracker fetch. `retention()` reports only the retained-data budget,
not the active form, inventories, DOM or total browser memory.

## Invalidation and failure

`invalidate(key)` revokes that key's publication rights and marks matching data
stale. Without a key it invalidates all previews. Task events use their task key
or task ID when available. A cold issued request has no confirmed ID, so an
ID-based event also revokes unknown in-flight requests. Project changes invalidate
all previews because task keys can change with a project. Manual refresh and
reconnect use the shared refresh generation. Every publication checks both its
request identity and the current generation, including before a render occurs.
An older response cannot make invalidated data current again.

Cold detail shows its own key with a loading status, then a retryable error when
needed. Stale matching data stays visible with a refresh notice. A failed
background read says that it is showing previously loaded data and offers Retry.
Retry or re-entry can read again. Failed or absent responses are not retained as
permanent answers. Only a successful current response can prove absence. The
existing save barrier must still accept selection clearing, and its predicate
must still reject a newer loading, failed or restored result.

A successful detail write calls `invalidateReuse(key)` during its save drain.
This drops the retained copy and revokes earlier issued reads without notifying
the active query mid-commit. The form retains its matching snapshot and overlays
its confirmed write and local draft. If the form survives the accepted transition,
it requests revalidation after its pending edits finish. Re-entry reads fresh data.
Do not trigger another guarded route change inside a committing save flight.

## Session inventories and lifetime

The shell, browse filters, new-task labels and keyed detail share successful
project, label and preset reads in the same session. Inventory snapshots have
explicit loading/error/current state. A persisted project snapshot is only a
seed, never proof of project deletion. Project events, manual refresh and
reconnect revoke inventory publication rights. Label groups preserve stable
snapshot identity until one member changes. Thread and PR hooks remain separate
live queries, including their existing focus/timer refresh behavior.

Native Ticket closure or parking does not end the page session. Page/session
closure removes subscriptions and releases task retention and inventories. The
React provider defers data disposal by one microtask so an effect replay can
resume the same live session; detached subscribers cannot receive publication.
`dispose()` releases all retained data and rejects later publication. A new RPC
binding receives new stores. There is no persistence across page closure, browser
reload or devices, and no cross-binding preview reuse.

See [browse-workspace.md](browse-workspace.md) for settled-order readiness,
current-surface reveal, Enter/Escape focus and pending-save tab switching.

## Verification

Run from `bb-plugin-tasks-plus`:

```sh
npm test -- --maxWorkers=2 shell/task-previews.test.ts shell/task-inventory.test.ts shell/task-data.test.tsx shell/browse-preview.test.tsx shell/browse-preview-safety.test.tsx
npm test -- --maxWorkers=2
npm run typecheck
npm run lint
npm run build
```

The focused tests check request counts and ownership, not jsdom timing thresholds.
Installed frame-aligned measurements use the owned navigation benchmark and both
plugins. A local passing test does not establish the 100 ms p95 target or native
host behavior. See the BBP-63 evidence report for measured, blocked and unrun checks.
