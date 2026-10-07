# Proposal

## Why

The Pull Requests sidebar row has no count. To see if new review requests came in, the user must open the panel and remember the last number. Review threads are hidden from the sidebar thread list, so the user also cannot see when a review agent finishes.

## What Changes

- The Pull Requests sidebar row shows the number of PRs in "Needs review".
- The number uses the accent pill when "Needs review" holds a PR that the user has not seen yet.
- Opening the Pull Requests panel marks all PRs in "Needs review" as seen. The pill clears.
- A review thread "came back" when its agent stopped (idle or error) and the user has not opened the thread since, or when it needs the user.
- The sidebar row shows a separate dot when one or more review threads came back.
- PR cards with a returned thread show an accent status ("Agent finished", "Needs you", "Failed") and sort to the top.
- Opening a review thread, from the card or any other way, clears its returned state.
- The queue re-links thread state when a thread goes idle, so the dot and cards update without waiting for the 5-minute refresh.
- Seen and opened state are stored on the server, so all windows agree.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pr-review-requests`: adds the sidebar count badge, the unseen-PR pill, the returned-thread dot, and returned-thread status on cards. Changes the list order and the card thread status to include returned threads.

## Impact

- `bb-plugin-github-insight/app.tsx`: the navPanel gets a sidebar accessory.
- `bb-plugin-github-insight/queue/`: the review queue service stores seen PR keys and returned thread ids in plugin KV, and adds the new state to the published view.
- `bb-plugin-github-insight/server.ts`: `thread.idle` also updates the review queue.
- `bb-plugin-github-insight/contract.ts`: new RPCs to mark the queue seen and a thread opened. The review queue view gets new fields.
- `bb-plugin-github-insight/ui/`: sidebar badge, card status, and the thread composer banner reports thread opens.
- No new GitHub calls.
