# Proposal

## Why

A PR that the user marked reviewed stays in "Reviewed" until its author pushes. Replies to the user's comments and new review requests without a push do not show. Example: on `collibra/frontend#25818` the author replied to the user's comment and then requested their review again. The list did not change.

## What Changes

- A marked PR moves back to "Needs review" when a person other than the user posts a comment, a reply, or a review with text after the mark. The card shows "New comments".
- A marked PR moves back to "Needs review" when GitHub requests the user's review again after the mark. The card shows "Review requested again".
- **BREAKING** (behavior): the current scenario "Review requested again with no push: stays in Reviewed" changes. The PR now moves to "Needs review".
- Comments and reviews from bots and from the user do not count. An approval with no text does not count.
- "Mark reviewed" clears both labels, because it sets a new mark time.
- The sidebar pill shows the accent when a PR comes back this way, through the existing unseen rule.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pr-review-requests`: "Reviewed state" also uses activity after the mark. A new requirement defines which activity counts and the card labels.

## Impact

- `bb-plugin-github-insight/github/review-queue-query.ts`: the tracked PR aliases also fetch recent timeline items and the viewer login. The review request search does not change.
- `bb-plugin-github-insight/core/review-queue.ts`: parse and summarize the activity for tracked PRs.
- `bb-plugin-github-insight/queue/review-queue-service.ts`: compare the activity with `markedAt` and choose the section.
- `bb-plugin-github-insight/core/review-queue-view.ts` and `ui/review-queue-list.tsx`: new card labels.
- `README.md` and `PLUGIN_OVERVIEW.md` in the plugin: "Reviewed state" docs.
- No new GitHub calls. No new kv keys. `markedAt` already exists.
