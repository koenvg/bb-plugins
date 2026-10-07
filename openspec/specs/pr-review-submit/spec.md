# pr-review-submit Specification

## Purpose

Lets the agent of a bb thread save review comments and a review summary as drafts, and lets the user edit them and submit them to GitHub as one review with a verdict.

## Requirements

### Requirement: Save a comment draft from the CLI

The command `bb github-insight review comment <path> --line <n>` SHALL save a comment draft for the PR of the calling thread, with a body from `--body` or `--body-file`. It SHALL accept `--side` (`RIGHT` by default, or `LEFT`) and `--start-line` for a range. It SHALL save the PR head commit with the draft and print the new draft id. It SHALL NOT write to GitHub.

#### Scenario: Save a comment on a new line

- **WHEN** the agent runs `review comment src/a.ts --line 42 --body "Null check missing"` on a thread whose PR changes line 42 of `src/a.ts`
- **THEN** the command saves a draft on new line 42 of `src/a.ts`, prints its id, and exits 0

#### Scenario: Body from a file

- **WHEN** the agent runs the command with `--body-file notes.md`
- **THEN** the draft body is the text of `notes.md`, read relative to the working directory

#### Scenario: Not in a thread

- **WHEN** the command runs outside a bb thread
- **THEN** it fails with "Not running in a bb thread"

### Requirement: Reject a comment that GitHub cannot place

The `review comment` command SHALL fail, and save nothing, when the path is not a file of the PR, when the line or range is not in that file's diff on the given side, when the start line is after the line, or when the body is empty.

#### Scenario: Line outside the diff

- **WHEN** the agent saves a comment on line 300 of `src/a.ts` and the diff of `src/a.ts` does not contain line 300 on the new side
- **THEN** the command fails with a message that names the diff ranges of `src/a.ts` on that side

#### Scenario: Unknown file

- **WHEN** the agent saves a comment on `src/missing.ts` and the PR does not change that file
- **THEN** the command fails with "Not a file of this pull request: src/missing.ts"

### Requirement: One commit per set of comment drafts

All comment drafts of one PR SHALL have the same commit. The `review comment` command SHALL fail when the PR has comment drafts at another commit than the current head, and SHALL tell the agent to submit or delete those drafts first.

#### Scenario: Head moved since the first draft

- **WHEN** the PR has 2 comment drafts at commit `abc123` and the head is now `def456`
- **THEN** a new `review comment` fails and names both commits

### Requirement: Save a summary draft from the CLI

The command `bb github-insight review summary` SHALL save the review body draft for the PR of the calling thread, from `--body` or `--body-file`. A new summary SHALL replace the old one. It SHALL NOT write to GitHub.

#### Scenario: Replace the summary

- **WHEN** the agent saves a summary and then saves a second summary
- **THEN** only the second summary is kept

### Requirement: List drafts from the CLI

`bb github-insight review list` SHALL also print each comment draft (id, path, side, line or range, and body) and the summary draft. With `--json`, the output SHALL contain them as `comments` and `summary` next to `threads`.

#### Scenario: List with drafts

- **WHEN** the PR has 2 comment drafts and a summary draft, and the agent runs `review list --json`
- **THEN** the output has `comments` with 2 entries and `summary` with the summary text

### Requirement: Comment drafts in the Review tab

The Review tab SHALL show each comment draft below its line in the file diff, on its side, marked "Pending comment". The user SHALL be able to edit the body and delete the draft. Edits SHALL be kept after the tab closes. The tab SHALL update without a refresh when the agent saves a draft.

#### Scenario: Draft on its line

- **WHEN** the PR has a comment draft on new line 42 of `src/a.ts`
- **THEN** the diff of `src/a.ts` shows the draft below new line 42, marked "Pending comment"

#### Scenario: Agent saves while the tab is open

- **WHEN** the tab is open and the agent saves a comment draft
- **THEN** the draft shows in the tab without a manual refresh

#### Scenario: Delete a draft

- **WHEN** the user deletes a comment draft
- **THEN** the draft goes away from the tab and from `review list`, and nothing is written to GitHub

### Requirement: Drafts on an older commit

When the comment drafts are at another commit than the PR head, the Review tab SHALL show a warning that names both commits and tells the user to submit or delete those drafts to add new comments. It SHALL show those drafts in a list with path, side, line, and body, not on the lines of the current diff.

#### Scenario: Author pushed after the review

- **WHEN** the drafts are at commit `abc123` and the PR head is `def456`
- **THEN** the tab shows "PR has new commits since these drafts (abc123 -> def456)" and "Submit or delete these drafts to add new comments.", and lists the drafts above the files

### Requirement: Submit panel

The Review tab SHALL have a "Submit review" panel with the summary draft as an editable body, the number of comment drafts that are not empty, and the verdicts Comment, Approve, and Request changes. When the viewer is the PR author, only Comment SHALL show. Request changes, and Comment with no comment drafts that are not empty, SHALL need a body that is not empty.

#### Scenario: Review of another person's PR

- **WHEN** the user opens the panel on a PR that another person wrote
- **THEN** the panel shows Comment, Approve, and Request changes

#### Scenario: Own PR

- **WHEN** the user opens the panel on their own PR
- **THEN** the panel shows only Comment

#### Scenario: Request changes without a body

- **WHEN** the body is empty and the user selects Request changes
- **THEN** the submit action is disabled with the text "Add a summary to request changes"

#### Scenario: Empty comment drafts do not count

- **WHEN** the PR has 2 comment drafts, one of them empty, and the body is empty
- **THEN** the panel shows "1 comment" and Comment is enabled

#### Scenario: Only empty comment drafts

- **WHEN** the PR has 1 comment draft, it is empty, and the body is empty
- **THEN** the panel shows "0 comments" and Comment is disabled with the text "Add a summary or a comment"

### Requirement: Submit one review

Submit SHALL send one GitHub review with the body, the verdict, and all comment drafts that are not empty, on the commit of the drafts, or on the PR head when there are no comment drafts. It SHALL send nothing else. After a successful submit, it SHALL delete all comment drafts, empty ones too, and the summary draft, and refresh the PR tab and the Review tab.

#### Scenario: Approve with 3 comments

- **WHEN** the PR has 3 comment drafts and the user submits Approve with a body
- **THEN** GitHub has one new approving review with that body and 3 line comments, and the tab shows no drafts

#### Scenario: Approve with no drafts

- **WHEN** the PR has no drafts and the user submits Approve with an empty body
- **THEN** GitHub has one new approving review at the PR head

#### Scenario: Empty draft is not sent

- **WHEN** the PR has 2 comment drafts, one of them empty, and the user submits Comment
- **THEN** GitHub has one new review with 1 line comment, and the tab shows no drafts

### Requirement: Submit failure

When GitHub rejects the submit, the tab SHALL show the GitHub error and keep all drafts and the body. When the user already has a pending review on the PR, the error SHALL include a link to the PR on GitHub.

#### Scenario: Pending review on GitHub

- **WHEN** the user has a pending review on github.com for the PR and submits from bb
- **THEN** the tab shows the error with a link to the PR, and all drafts stay

#### Scenario: gh not logged in

- **WHEN** `gh` is not logged in on the thread's host and the user submits
- **THEN** the tab shows "gh not logged in" and all drafts stay

### Requirement: Drafts stay after a restart

Comment drafts and the summary draft SHALL be kept per PR in plugin storage, and SHALL stay after a bb restart. When the PR is merged or closed, the tab SHALL keep the drafts but disable submit.

#### Scenario: Restart

- **WHEN** the PR has 2 comment drafts and bb restarts
- **THEN** the Review tab shows the 2 drafts

#### Scenario: Merged PR

- **WHEN** the PR is merged and it has comment drafts
- **THEN** the drafts show and the submit action is disabled with the text "Pull request is merged"

### Requirement: Submit marks the PR reviewed

After a successful submit on a PR where the viewer is not the author, the plugin SHALL mark that PR reviewed at the commit of the submitted review. The Pull Requests panel SHALL show the new state without waiting for its next background refresh. When the mark cannot be saved, the submit SHALL still count as successful and the Review tab SHALL tell the user to use "Mark reviewed" in the Pull Requests panel.

#### Scenario: Approve marks reviewed

- **WHEN** the user submits Approve on `acme/api#15` at head `abc123`
- **THEN** `#15` is in "Reviewed" in the Pull Requests panel

#### Scenario: Submit on older drafts

- **WHEN** the comment drafts are at `abc123`, the head is `def456`, and the user submits
- **THEN** the PR is marked reviewed at `abc123` and shows in "Needs review" with "Updated since review"

#### Scenario: Comment on your own PR

- **WHEN** the viewer is the PR author and submits Comment
- **THEN** the plugin does not mark the PR reviewed

#### Scenario: Mark save fails

- **WHEN** GitHub accepts the review and the plugin cannot save the mark
- **THEN** the Review tab shows the review as submitted and tells the user to use "Mark reviewed"

### Requirement: Start a comment draft from the diff

The Review tab SHALL show a "+" in the gutter of each diff line that GitHub can comment on. A click SHALL save an empty comment draft on that line and side, at the PR head, and show its card below the line with the focus in the text box. It SHALL NOT write to GitHub. The "+" SHALL NOT show when comment drafts are on an older commit, or when the PR is merged or closed.

#### Scenario: Add a comment on a new line

- **WHEN** the user clicks "+" on new line 42 of `src/a.ts`
- **THEN** an empty comment draft shows below new line 42 with the focus in its text box, and `review list` shows that draft

#### Scenario: Add a comment on a deleted line

- **WHEN** the user clicks "+" on old line 7 of `src/a.ts`
- **THEN** the comment draft is on the LEFT side at line 7

#### Scenario: Comment stays after a restart

- **WHEN** the user clicks "+", types "Rename this", and bb restarts
- **THEN** the Review tab shows the draft with "Rename this" on its line

#### Scenario: Second comment on the same line

- **WHEN** a line has a comment draft and the user clicks "+" on that line
- **THEN** the line has 2 comment drafts

#### Scenario: Drafts on an older commit

- **WHEN** the comment drafts are at commit `abc123` and the PR head is `def456`
- **THEN** the diff shows no "+"

#### Scenario: Merged PR

- **WHEN** the PR is merged
- **THEN** the diff shows no "+"
