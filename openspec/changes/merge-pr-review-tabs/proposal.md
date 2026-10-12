# Proposal

## Why

The review queue counts PR conversation comments and review bodies as new activity, but the plugin does not show them anywhere. The "New comments" pill can turn on for a comment that the user cannot see in bb. Also, the PR state and the review diff are in two separate side-panel tabs, so the user must move between them for one PR.

## What Changes

- The "PR" tab gets two sub-tabs: "Overview" and "Files".
- "Overview" shows the current PR tab content (header, summary, actions, blockers, reviewers, checks), then a timeline of the PR conversation.
- The timeline shows PR comments, reviews (verdict, body, and a link to their inline comments in "Files"), commit pushes (grouped), and lifecycle events (ready for review, closed, reopened, merged).
- "Overview" has a composer. The user can post a new PR comment from bb.
- "Files" shows the current Review tab content without change.
- **BREAKING**: The plugin removes the "Review" side-panel action. Saved "Review" tabs do not come back after an upgrade.
- **BREAKING**: The palette command "GitHub: Open Review tab" becomes "GitHub: Open PR files".
- "GitHub: Submit review", "GitHub: Next comment", and "GitHub: Previous comment" open the PR tab on "Files".
- The PR tab keeps the last selected sub-tab. The sidebar PR badge and the composer banner open "Overview".

Out of scope:

- New comment glow and per-comment "seen" state. A later change adds them to both sub-tabs.
- Agent drafts of PR comments.
- Inline review threads in the timeline. They stay only in "Files".
- Other timeline events (labels, assignees, review requests, renames, force pushes, base changes, cross-references).

## Capabilities

### New Capabilities

- `pr-tab-sub-tabs`: The PR tab with "Overview" and "Files" sub-tabs: sub-tab selection, which sub-tab each entry point opens, loading, and the removal of the "Review" tab.
- `pr-conversation-timeline`: The conversation timeline in "Overview": event types, order, links to inline comments, and posting a new PR comment.

### Modified Capabilities

- `pr-commands`: The command list, "Open PR files", "Submit review", and merge behavior name the "Files" sub-tab in place of the "Review" tab.
- `pr-review-comment-navigation`: "Next comment" and "Previous comment" open the PR tab on "Files".
- `pr-tab-layout`: one "Merge status" card replaces the summary line and the separate blocker list. Each blocker shows its fix. A failure reason that repeats an annotation shows once.

## Impact

- `bb-plugin-github-insight/app.tsx`: one `threadPanelAction` ("pr", layout "flush") in place of two.
- `bb-plugin-github-insight/ui/pr-tab.tsx`, `ui/review-tab.tsx`: become the "Overview" and "Files" bodies inside a new sub-tab shell.
- `bb-plugin-github-insight/ui/command-intents.ts`, `ui/commands.ts`: the "review" intents move to the "pr" tab, with a sub-tab intent.
- `bb-plugin-github-insight/ui/use-pr-panel-navigation.ts`, `ui/composer-banner.tsx`: open "Overview".
- New GitHub GraphQL query for timeline items, new RPCs to read the timeline and to post a PR comment (`addComment` mutation).
- `bb-plugin-pr-thread-list` keeps calling `requestPrPanel` with no change.
- Other specs still use the name "Review tab". `pr-tab-sub-tabs` states that this name means the "Files" sub-tab.
