# Proposal

## Why

Draft writes in the Review tab are slow. A draft is a local KV record, but after each create, delete, or discard the tab loads the full PR from GitHub two times (PR files, review threads, PR head). The card stays until that load finishes, which takes seconds on a large PR.

## What Changes

- New RPC `getDrafts`: reads comment drafts, reply drafts, and the summary draft from KV only. No GitHub call.
- New realtime event "drafts updated". All draft writes (UI and agent CLI) send it and do not send the full review update.
- The Review tab reloads only the drafts on "drafts updated". It does a full reload only on Refresh, first open, submit, resolve, and reply.
- Each write starts one reload, not two: the UI stops calling `reload` after a draft write and waits for the realtime event.
- Delete of a comment draft hides the card on click. If the RPC fails, the card comes back with the error.
- The server keeps the last loaded PR files and head per PR. "+" checks the new draft against that data and does not call GitHub. If the server has no data for the PR yet, it loads from GitHub once. Each full load replaces the data.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pr-review-submit`: deleting a comment draft removes its card at once, and draft writes do not call GitHub.

## Impact

- `bb-plugin-github-insight/contract.ts`: `getDrafts` RPC.
- `bb-plugin-github-insight/core/review-updated.ts`: "drafts updated" channel.
- `bb-plugin-github-insight/review/review-service.ts`: drafts-only read, PR data cache.
- `bb-plugin-github-insight/review/review-writes.ts`: create uses the cache, writes publish "drafts updated".
- `bb-plugin-github-insight/server.ts`: register the RPC.
- `bb-plugin-github-insight/ui/review-tab.tsx`, `ui/comment-drafts.tsx`, `ui/thread-actions.tsx`: drafts-only reload, optimistic delete, one reload for each write.
- No GitHub API change. No KV format change.
