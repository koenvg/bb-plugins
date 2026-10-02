# Design

## Context

- The SDK has one slot for the thread top bar: `app.slots.experimental_threadHeaderAction`. It gets `{ threadId, projectId, isCompactViewport }`. The row is 48px high and controls are 28px.
- The slot mounts once per pane in a split layout.
- Thread-to-task links live in the `task_threads` table. The server store has `listTaskThreadsByThreadId`, sorted by `task_id`. No RPC reads links by thread.
- The "task" `threadPanelAction` already opens a task from `params.taskKey`. The chat task card opens it the same way.
- Plugin RPC and realtime are scoped to one plugin.

## Goals / Non-Goals

**Goals:**
- One read RPC and one small component. Reuse the existing panel, status icon, and labels.

**Non-Goals:**
- Change the status from the chip.
- A menu for the "+N" tasks.
- Show the thread live status (`working`, `idle`, ...).

## Decisions

1. **Build the chip inside tasks-plus, not as a new plugin.** It needs the tasks-plus RPC and realtime events, and those are plugin-scoped. A separate plugin would need a cross-plugin bridge that does not exist.

2. **New RPC `getTasksForThread({ threadId }) -> { tasks: Task[] }`, sorted by `attached_at`, then `id`.**
   - It returns the full list, so the client can show "+N" and the server does not decide how many to show.
   - A new store query sorts by `attached_at`. The existing `listTaskThreadsByThreadId` keeps its order, because lifecycle code uses it and its order does not matter there.
   - Alternative: read the thread's link rows on the client and call `getTask` for each. Rejected: N+1 calls for each header.

3. **Open with `useBbNavigate().openThreadPanel({ actionId: "task", params: { taskKey } })`.** This is the same path as the chat task card, so the panel content is the same everywhere.

4. **Refresh on every `tasks:changed` and `threads:changed` event, with no filter.** The `threads:changed` payload carries the task ID, not the thread ID, so the chip cannot know if a new link is for its thread. The RPC is one indexed query (`idx_task_threads_thread`), so a refresh on each event is cheap. Use a request counter so that only the latest response is used, as `useTaskEmbed` does.

5. **Render nothing while loading, when the list is empty, and on error.** The top bar is shared chrome. An empty or error state there adds noise for each thread that has no task.

6. **Keep state in the component.** The slot mounts once per pane, so no module-level cache.

## Risks / Trade-offs

- [The `experimental_` slot changes or is removed in a future SDK release] → All slot use is in `app.tsx` and one component. An `app.test.tsx` test fails if the registration shape changes.
- [The chip appears after the RPC returns, which can move the controls next to it] → Accept. The chip is at the left end of the action row, so the move is small. Revisit if it looks bad in use.
- [Links created by a path that does not publish `threads:changed`] → The chip stays stale until the next event or remount. Today the delegate path publishes it on link.
