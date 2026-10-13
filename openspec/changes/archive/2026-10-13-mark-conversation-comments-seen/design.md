# Design

## Context

- Inline comments: the queue keeps `{ id, postedAt }` per comment. `newCommentIds(comments, markedAt, seen)` in `core/new-comments.ts` filters them. The Files sub-tab glows and marks them seen through `useNewCommentGlowState` and `useCommentSeen`. RPC `markCommentsSeen` writes the ids to `comment-seen:v1:<pr>`.
- Conversation comments and review texts: the queue keeps only `lastConversationAt`. `newActivitySince` compares it with `markedAt` and ignores the seen set.
- The Overview Conversation timeline (`ui/timeline.tsx`) shows comment and review cards with their GitHub node ids. It has no glow and no seen tracking.
- The Overview scroll element is the `overflow-y-auto` div in `ui/pr-panel.tsx`. Its sub-tab panel uses `hidden` when not selected.

## Goals / Non-Goals

**Goals:**

- One seen model for all comment kinds: same filter, same store, same RPC, same glow hook.

**Non-Goals:**

- Seen tracking for a review with no text. Its inline comments stay in the Files sub-tab.
- Loading older timeline pages to find a new comment.
- A "jump to new comment" control in Overview.

## Decisions

### 1. Per-id conversation activity in the queue

Replace `lastConversationAt` with `conversationComments: PostedComment[]` in `PrActivity`.

- PR comment: `{ id: comment.id, postedAt: comment.createdAt }`.
- Review with text: `{ id: review.id, postedAt: review.submittedAt }`.
- `QueueActivity` adds `id` to `comments` and `reviews` nodes.
- `newActivitySince` runs `newCommentIds` on `[...conversationComments, ...inlineComments]`.

Alternative: keep `lastConversationAt` and add a "conversation seen at" time. Rejected. A time cannot tell which of 2 comments the user saw.

The stored queue schema goes from `v: 3` to `v: 4`, because old entries do not have `conversationComments`. An old entry then reads as no stored view, and the next build fills it.

### 2. The review id is the seen key for a review text

The timeline card already uses the review node id. GitHub node ids are unique across types, so review ids, issue comment ids, and inline comment ids can share one seen set.

### 3. `getTimeline` returns `newCommentIds`

- The timeline query adds `viewer { login }` and `__typename` on each author.
- `createTimelineService` gets a `newCommentBasis` dep, the same function `review-service` uses.
- The service builds `PostedComment[]` from the page: comments, and reviews with text, where `isOtherPerson(author, viewer)`. Then it calls `newCommentIds`.
- `timelineResultSchema` adds `newCommentIds: string[]`.

Alternative: the UI computes new ids from the queue view. Rejected. The PR tab of a thread that is not in the queue has no activity data, and the timeline already has the events.

The timeline hook keeps the union of `newCommentIds` from every loaded page, as the events are merged.

### 4. Glow and seen in the Overview timeline

- `pr-panel.tsx` makes a ref for the Overview scroll div and gives it to `OverviewTab`, then to `TimelineSections`.
- `ConversationTimeline` calls `useNewCommentGlowState(threadId, newCommentIds, root)` and gives it with `NewCommentGlowContext`.
- `Card` gets a `commentId` prop. The comment card and the review card with text call `useNewComment(id)`, set the ref, and add `review-comment-new` when glowing. The card needs `position: relative` for the `::before` border.
- No new CSS and no new RPC.

Alternative: a context for the scroll root. Rejected. There is one consumer, 2 levels down, so a prop is simpler.

### 5. Sub-tab switch stops the timer

The Overview panel has `hidden` when Files is selected. `display: none` makes the IntersectionObserver report "not intersecting", so `useCommentSeen` stops the timer. No extra code. A test covers it.

## Risks / Trade-offs

- [New comment older than the first timeline page (100 items)] → It cannot glow until the user loads older events, so the queue label stays. A new comment is after `markedAt`, so this needs 100+ events after the mark. Accept.
- [Queue reads the last 20 PR comments and 20 reviews] → Same window as today. No change in what counts.
- [Review with text and inline comments] → The review text and each inline comment are separate ids. The label clears only after the user sees all of them. This matches the specs.
- [Stored queue version bump] → The first panel open after the update shows a skeleton until the build ends. Same as earlier bumps.

## Migration Plan

- No kv migration. `comment-seen:v1` keeps its shape and gets more ids.
- Rollback: an old build reads `v: 4` as no stored view and rebuilds. Extra ids in `comment-seen:v1` have no effect on it.
