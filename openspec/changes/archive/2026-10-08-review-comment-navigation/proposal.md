## Why

A PR can have many files and only a few comments. In the Review tab, the only sign of a comment is a count in the file header. To find each comment draft or open thread, you must scroll through all files.

## What Changes

- A comment stepper in the Review tab header: a counter (`3 / 12`) and previous and next buttons.
- The stepper goes through comment drafts and open review threads together, in page order: older comment drafts, outdated threads, then each file in file order, by line.
- "Next" and "previous" start from the scroll position, not from the last jump. The counter shows the comment at the top of the diff area.
- A jump scrolls the comment card to the top of the diff area and highlights it for a short time. The jump stays correct while lazy file diffs above it load and change height.
- At the last comment, "next" goes to the first comment. At the first comment, "previous" goes to the last comment.
- Two palette commands: "GitHub: Next comment" and "GitHub: Previous comment". They open the Review tab when it is closed. They have no default shortcut.
- The scroll-and-pin logic from the Changes tab file outline moves to `review-ui/`, so the Changes tab and the Review tab use the same code.

Out of scope:

- A comments sidebar or a "Files / Comments" switch on wide screens. A later change can add it on top of the same ordered list and jump.
- Default keyboard shortcuts.
- Comment navigation in the Changes tab.

## Capabilities

### New Capabilities

- `pr-review-comment-navigation`: the order of comments in the Review tab, the stepper, the jump and highlight, and the palette commands for next and previous comment.

### Modified Capabilities

None. The Changes tab file outline keeps its behavior. Only its code moves.

## Impact

- `bb-plugin-github-insight/ui/review-tab.tsx`: stepper in the header, intent listener.
- `bb-plugin-github-insight/ui/file-diff.tsx`, `review-thread.tsx`, `comment-drafts.tsx`, `outdated-threads.tsx`, `older-comment-drafts.tsx`: data attributes on file sections and comment cards.
- `bb-plugin-github-insight/core/`: a pure function that builds the ordered comment list.
- `bb-plugin-github-insight/ui/commands.ts`, `command-intents.ts`: two new commands and two new Review tab intents.
- `bb-plugin-changes/ui/use-file-navigation.ts` and `review-ui/`: shared pin logic.
