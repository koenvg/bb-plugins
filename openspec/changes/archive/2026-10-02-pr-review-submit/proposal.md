# Proposal

## Why

"Review in thread" starts an agent that reviews a PR, but its findings stay in the chat. To post them, the user copies each finding to GitHub by hand, line by line. OpenForge lets the user edit the agent's comments and submit one review. bb cannot do this yet.

## What Changes

- New CLI command `bb github-insight review comment`. The agent saves a **comment draft** on a file and line of the thread's PR. It never posts to GitHub.
- New CLI command `bb github-insight review summary`. The agent saves a draft of the review body.
- `bb github-insight review list` also prints the comment drafts and the summary draft.
- The Review tab shows each comment draft on its line, marked "Draft from agent". The user can edit or delete it.
- A "Submit review" panel in the Review tab: a body text, the number of comment drafts, and the choice **Comment**, **Approve**, or **Request changes**. Approve and Request changes do not show on the user's own PR.
- Submit sends one GitHub review with the body, the verdict, and all comment drafts. After a successful submit, the drafts are deleted.
- When the PR has new commits after the drafts were saved, the tab shows a warning. The comments are still sent on the commit where the agent saved them.
- The review prompt of "Review in thread" tells the agent to save each finding with `review comment`, and a summary with `review summary`. It still tells the agent not to post to GitHub.

Out of scope for this change:
- New line comments that the user writes by hand.
- GitHub suggestion blocks.
- A GitHub pending review that already exists. The submit fails and the tab shows the GitHub error.
- Reviewed-at-commit tracking in the Pull Requests panel.

## Capabilities

### New Capabilities

- `pr-review-submit`: comment drafts and summary drafts from the agent, their display and edit in the Review tab, and submitting them as one GitHub review with a verdict.

### Modified Capabilities

- `pr-review-requests`: the "Review prompt" requirement tells the agent to save findings as drafts with the CLI.

## Impact

- `bb-plugin-github-insight` only. No bb core change and no new dependency.
- `review/review-cli.ts`, `review/draft-store.ts`, `review/review-service.ts`, `review/review-writes.ts`, `contract.ts`, `host.ts`, a new mutation in `github/`, `ui/review-tab.tsx`, `ui/file-diff.tsx`, `core/review-prompt.ts`, and `README.md`.
- One new GitHub write: the `addPullRequestReview` mutation, run with `gh api graphql` on the thread's host.
