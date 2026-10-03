# Proposal

## Why

All PR actions of a thread (merge, enqueue, refresh, submit a review, open on GitHub) need a mouse click in the "PR" tab, the "Review" tab, or the composer banner. Keyboard users cannot run them from bb's command palette.

## What Changes

- Add six commands to bb's command palette, shown only when a thread is in view:
  - `GitHub: Merge PR`
  - `GitHub: Open PR tab`
  - `GitHub: Open Review tab`
  - `GitHub: Submit review`
  - `GitHub: Refresh PR`
  - `GitHub: Open PR on GitHub`
- Each command opens the tab it needs and that tab does the work. It uses the dialog, progress, and error UI that the tab already has.
- `GitHub: Merge PR` goes through the same confirm dialog for merge. Enqueue runs at once, the same as a click on "Enqueue".
- Allow a palette command as a source of a merge or enqueue. The CLI and agent tools still cannot merge or enqueue.
- No command sends review threads to the agent. That action needs a selection of threads, and the palette has no selection.

## Capabilities

### New Capabilities
- `pr-commands`: Command palette commands that run the thread's PR actions through the "PR" and "Review" tabs.

### Modified Capabilities
- `pr-merge-actions`: "Writes only from the user" adds the `GitHub: Merge PR` command as an allowed source of a merge or enqueue.

## Impact

- `bb-plugin-github-insight/app.tsx`: registers the commands.
- New command and intent modules in `bb-plugin-github-insight/ui/`.
- `ui/pr-tab.tsx`, `ui/merge-action-button.tsx`, `ui/review-tab.tsx`: react to intents from a command.
- `bb-plugin-github-insight/README.md` and `PLUGIN_OVERVIEW.md`: document the commands.
- No new RPC methods, no server change, no new dependency.
