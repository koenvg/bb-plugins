# Design

## Context

See proposal.md for motivation and specs/thread-task-panel/spec.md for behavior.

The SDK passes `threadId` to every thread panel and passes null params for an action opened with defaults. `app.tsx` registers Task without a run callback. `TaskEmbedPanelContent` currently reads only `params.taskKey`, so the launcher reaches its message-card hint instead of looking up the thread.

`getTasksForThread` already returns linked tasks ordered by `attached_at` and link ID, without filtering out Done. The header takes its first result. `useTasksQuery` supplies loading, error, refresh, event invalidation, and reconnect handling. `useSafeTaskTarget` delays target changes behind the current editor's save barrier.

The user confirmed that the header chip opens details. The screenshot's blank screen was not reproduced, so live launcher verification remains necessary.

## Goals / Non-Goals

**Goals:**

- Add a thread-based default without changing the existing explicit-key route.
- Keep the panel key, detail view, and Open in Tasks target on one committed selection.
- Reuse the existing lookup and query lifecycle rather than building a second request manager.

**Non-Goals:**

- No header-query refactor, global task-selection state, or backend changes.
- No task chooser, new panel layout, or new automatic retry policy.
- No change to save failure handling, editor behavior, or host tab persistence.

## Decisions

### Resolve missing keys inside the panel

Use the panel's `threadId` when the trimmed task key is absent or empty. Keep nonempty explicit keys on the existing validation/detail path, including invalid keys. The fallback lookup must not gate explicit task links or issue unnecessary lookups for them.

Keep `useTasksQuery` unconditional in the existing panel component, but call `getTasksForThread` only when there is no explicit key. Include the thread ID and requested key as dependencies, and use the same task/thread invalidation channels as the header. Feed the first result's key to the existing task-target/save handling. This keeps the editor mounted when panel params change between explicit and default selection.

Alternative: resolve the task in an action run callback and pass its key when opening the tab. Rejected because restored no-param tabs would still show the old hint, and lookup feedback would be separate from the panel. A shared header/panel lookup abstraction is not needed for these two small callers.

### Retain the committed detail while a selection update is pending

Route resolved key changes through `useSafeTaskTarget`. Do not remount the session or detail editor on each lookup refresh, or replace the current detail before its save barrier completes. Use the committed key for the panel header, detail, and Open in Tasks link.

Keep an already shown task stable during background refresh. Show initial loading, empty, and error feedback when there is no committed detail. During background refresh, keep the detail visible and show compact loading or error feedback beside it, with Retry after failure. A failed refresh must not become a successful empty result. Reuse existing query refresh and stale-response protection rather than adding polling or a custom sequence counter.

### Keep feedback native and small

Reuse the current panel structure, theme tokens, loading components, and button styles. Loading must have an accessible status. Empty copy can say "No task is linked to this thread." Initial lookup failure needs a clear message and Retry. No visual redesign or layout mode change is required.

## Risks / Trade-offs

- A lookup update could unmount an edited detail before saving. Mitigate by keeping the session mounted and rendering from the committed target; retain the current detail when saving fails.
- Default and explicit selection could diverge accidentally. Mitigate with slot tests proving explicit keys take priority and do not depend on the thread lookup.
- Component tests alone cannot explain the reported blank launcher. Mitigate with a live BB check through the actual Task action after implementation, plus a header-chip comparison.

## Migration Plan

No data migration is needed. Implementation will use the normal plugin build and verification workflow. Live installation or reload requires authorization at apply time. Rollback restores the previous frontend bundle; task data and links are unchanged.
