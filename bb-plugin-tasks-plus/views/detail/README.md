# Safe ticket transitions

This is the BBP-9 contract for the existing detail editor and later split workspace.
It does not select rows, reconcile visible order, or own project preferences.

## Workspace integration

- Mount `TasksSessionProvider` once for the Tasks panel. `TasksAppShell` already does
  this. A future browse workspace should reuse that provider, not nest another one
  or key it by selection. It owns one active editor barrier and task-id-keyed
  comment records for the mounted session.
- `useTasksSession()` returns the transition interface, or null outside a session.
  Call `request(() => commitDestination())` for selection, scope, or context changes.
  Put **all** related mutations in that callback, including URL, highlight, filter,
  and expansion changes that might remove the selected row. Do not mutate them
  first and then await the returned promise.
- Only the latest pending callback runs. All requests in the same save flight
  resolve to the flight's boolean result, not individual destination acceptance.
  A clean request commits synchronously. A failed save returns false, retains the
  origin and latest pending callback, and does not throw for RPC failures.
- `retry()` retries pending saves and commits the retained destination on success.
  With no destination, it only saves. `cancel()` forgets a pending destination;
  it neither discards edits nor cancels an already-sent write. Provider unmount
  cancels navigation callbacks. Register exactly one editable ticket per provider.
- `useSafeTaskTarget(requestedString)` holds externally supplied identity changes
  until the barrier succeeds. The shell uses it for host subpaths; standalone and
  thread-side detail use it for task keys. The thread panel guards its header,
  open-in-Tasks action, and detail with the same committed key. It cannot prevent
  the host from changing its URL before delivering props. It holds the rendered
  origin instead, including its topbar in the main panel. Host URL rollback/history
  interception is not an SDK contract provided here.
- `useTasksNavigation().go` requests before changing the host route when inside the
  provider. BBP-12 can request its own in-workspace selection through the same
  interface. Keep the existing task-link navigation adapter for off-list targets.
- Pass only the accepted subpath returned by `useSafeTaskTarget` into
  `useBrowseRoute`. That hook owns remembered project-or-All writes after the route
  is accepted. Do not write browse scope in `navigation.go`: requesting a route,
  even one whose save has succeeded, is not the host accepting that route. Keep
  entry inventory checks and history replacement inside `useBrowseRoute`.

## Autosaves

`createTaskEditSession(taskId, { save })` binds writes to an immutable task id.
`stage(patch, delayMs)` retains the latest title, description, or property values.
`flush()` cancels the debounce, serializes writes, and waits until every pending
edit is confirmed, including edits entered during an in-flight write. On rejection
or transport failure it returns `{ ok: false, errorMessage }` and retains the latest
failed values. Retry is explicit after failure. `subscribe` and `getSnapshot` expose
pending/saving/error state and the unconfirmed draft to the existing detail UI.

The description-only `createDescriptionSaver` delegates to this queue and offers
awaitable `flush(taskId)`. Detail uses one shared queue for all its autosaved fields,
not one queue per field. Title input is staged before blur, so a host-driven switch
cannot omit an active title edit. TaskDetail overlays unconfirmed edits on the
newest task snapshot, including confirmed update responses while a query catches up.
A delayed save response cannot displace a newer query snapshot. Reconciliation
uses the task timestamp first and uses snapshot identity only to break equal-time
ties against the query present when the write began.

Detail lookup still uses `useTasksQuery`. Task-keyed query and task-id-keyed form
lifetimes prevent previous requests, editor contents, menus, subtask forms, and
other local state from appearing under a replacement identity. No second query
cache or request system is introduced.

Embedded `DetailView.onMissing(key, stillMissing)` supplies a predicate that must
be checked inside the accepted clear callback. It rejects a newer loading, error,
or restored result. The optional `reconcileRevision` re-evaluates absence after
accepted workspace context commits, including Back. Standalone callers omit both.

Embedded `DetailView.onReady` notifies the workspace when the keyed lookup renders
a task or retryable error. Matching `data-detail-key` markup prevents stale readiness
from focusing a reloaded key early. The workspace owns non-editable pane focus;
standalone and embedded thread views do not opt in to this callback.

## Comment ownership

`CommentDraftsProvider` is part of `TasksSessionProvider`. `useCommentDraft(taskId)`
returns that task's snapshot and bound record. Updates and async completion must
use that captured record, never the newly selected task or a global setter.
Records include body revision, staged files, notification preference, send state,
and upload errors. A successful send clears only the body revision it submitted.
Uploads and retry retain the explicit submitted comment id even across unmount
and remount. Removing a staged file never uploads it.

Without a provider, the composer retains its local mounted lifetime. Files and
records are not written to local storage or the server on navigation. File preview
object URLs are revoked on unmount. Session records become unreachable with the
provider; an in-flight explicit operation retains only its originating record until
completion. No persistence after panel closure, browser reload, or on another device
is promised. Closing the whole host panel can only attempt a best-effort autosave.
