# Activity reads

`getTaskActivity({ taskId })` is an additive RPC. Its strict output is
`{ entries: Array<{ comment: DisplayComment, attachments: Attachment[] }> }`.
`TaskActivityEntry` exports the entry type from `shared/contract.ts`.

Each read returns the existing comment set in `created_at, rowid` order.
The server reads comments and attachment metadata in one synchronous database
transaction, then resolves live author thread titles and provider badges through
the same helper as `listComments`. Thread/provider failures keep the existing
fallback behavior. Missing, removed or unavailable threads have no resolved title;
the feed must not treat them as available notification destinations.

The attachment query joins `attachments.comment_id` to `comments.id` and filters
by the requested `comments.task_id`. It selects metadata columns only, without
`blob_path` or file bytes. Attachments retain `created_at, id` order within each
comment. Task-owned description files and other tasks' files are not included.
System events retain the compact system presentation and empty attachment lists,
as in the previous feed. An empty or missing task's activity returns `entries: []`,
matching the existing comment-list behavior, not proof of task existence.

File links, image previews and lightboxes still use `attachmentDownloadUrl(id)`.
File bytes load only through the existing authenticated HTTP download path.
`listComments`, `listAttachments`, CLI reads and notification delivery remain
available with their existing contracts. There is no storage migration or new
runtime dependency. Deploy the server and frontend together; an older server
without this RPC gives an explicit activity error, not a fallback request per comment.

## Frontend states

- Initial read: show `Loading activity…`; do not show confirmed empty activity.
- Success: show comments and their files, or `No activity yet.` for an empty result.
- Failure: show an alert with the read error and `Retry activity`. A comment or
  attachment-store failure rejects the complete RPC, not an attachment-free result.
- Refresh failure: retain only that mounted task's previous entries and label them
  `Showing previously loaded activity.` The retry button remains available.
- Pending or failed refresh: keep the target from the same task's retained entries,
  so an opted-in comment still requests notification. Explicit opt-out and known
  unavailable-thread behavior stay unchanged. Without loaded entries there is no
  target. The server resolves the latest responder and checks delivery on submission.

Activity starts when its component mounts, independently of heading/description
readiness. It uses one frontend RPC per load for 0, 1 or 50 comments, not one
attachment RPC per comment. Comment/task invalidation, manual refresh and reconnect
use the existing query mechanism; retries each issue one new activity read.
The keyed feed lifetime prevents previous task results, files or lightboxes from
appearing under a replacement task. Composer drafts stay in the existing task-owned
session provider. Editor activation is separate from activity loading.

## Editor activation

The keyed activity section keeps its heading and a 160 px minimum-height placeholder
at the same document position. The placeholder explains scroll activation and has a
native `Show activity` button. No comment editor or composer mounts until the section
intersects the viewport or the user activates it. The browser observer respects
clipping by the native scroll pane. It does not use an advance-loading margin.

Scrolling into the section mounts the full existing feed and composer. They stay
mounted for that task even when the user scrolls away. Tab can reach the activation
button. Enter or Space activates it. Activation moves focus to the section before
removing a focused button, including when scrolling makes a keyboard-focused button
visible. If IntersectionObserver is unavailable, the button and comment action still
work. No new Markdown renderer or retained editor cache is used.

The existing `m` comment action calls `TaskActivityHandle.focusComposer()`. It requests
activation first, then focuses and scrolls the ready composer into view. It does not
wait for the activity read. A pending focus request belongs to the keyed task and
ends when that task unmounts. Existing shortcut guards still control whether `m`
can run. Activation never submits, uploads or notifies.

Native tab parking does not reset an activated feed or its editor instances.
Observation pauses while the pane visibility context is false and resumes on reopen.
Task selection still destroys the old keyed feed and its editors. A return creates
new editors from the existing task-owned comment draft and staged-file record.

## Verification and measurement

`api/task-activity.test.ts` checks query count, ownership, output metadata, order,
legacy parity and failure propagation. `views/activity/activity-read.test.tsx`
checks real query/RPC calls with small editor substitutes. Native Ticket tests
prove heading and description remain available during an activity read and failure.

The heavy fixture uses the real store, RPC and Tiptap editors. The deferred view
creates one description editor and zero activity editors initially. Activation
creates 50 comment editors and the composer, with all ten file links.
See [the activity read report](../../scripts/navigation-benchmark/activity-read-report.md)
and [the editor activation report](../../scripts/navigation-benchmark/deferred-activity-report.md)
for separate initial-preview and activated-feed measurements and their limits.
These tests do not establish installed-host presentation time or the warm-navigation budget.
