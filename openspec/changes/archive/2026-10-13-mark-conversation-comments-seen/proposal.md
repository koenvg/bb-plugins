# Proposal

## Why

A PR conversation comment or a review with text keeps the "New comments" label on a reviewed PR until "Mark reviewed". The user cannot clear it by reading the comment. The old reason was "the Review tab does not show it". This is not true now: the Overview tab shows these comments in its Conversation timeline.

## What Changes

- A PR conversation comment and the text of a review become new comments with an id, as inline comments are now.
- The Overview Conversation timeline shows a glowing border on each new comment or review card.
- A new card becomes seen with the same rule as an inline comment: 60% visible for 1.5 s, the window has focus, the page is visible. The scroll root is the Overview scroll area.
- The seen ids go into the same per-PR seen store as inline comments.
- The review queue removes "New comments" when the user has seen all new inline comments, conversation comments, and review texts.
- The queue activity query reads the `id` of each PR comment and review. The timeline query reads the author type and `viewer { login }`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pr-review-new-comments`: new comments also include PR conversation comments and review texts, shown and seen in the Overview Conversation timeline.
- `pr-review-requests`: "New comments" on a reviewed PR clears when the user has seen every new comment, also conversation comments and review texts.

## Impact

- `bb-plugin-github-insight/github/review-queue-query.ts`, `core/review-queue.ts`, `queue/review-queue-service.ts`: per-id conversation activity.
- `bb-plugin-github-insight/github/timeline-query.ts`, `core/timeline.ts`, `timeline/timeline-service.ts`, `contract.ts`: `getTimeline` returns `newCommentIds`.
- `bb-plugin-github-insight/ui/timeline.tsx`, `ui/overview-tab.tsx`, `ui/pr-panel.tsx`, `ui/new-comment-glow.tsx`: glow and seen tracking in Overview.
- `bb-plugin-github-insight/README.md`: "Reviewed state" and "New comments" sections.
- No new kv key. No new RPC. The stored queue view version changes, because the activity shape changes.
