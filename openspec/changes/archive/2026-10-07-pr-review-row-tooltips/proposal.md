# Proposal

## Why

The PR rows in the Pull Requests panel have icon-only buttons (archive, mark, GitHub) and a CI icon. They use a native `title`, which shows late or not at all in bb. The user cannot see what a button does before selecting it.

## What Changes

- Show a bb tooltip on hover and keyboard focus for each icon-only control on a PR row:
  - "Archive thread"
  - "Mark reviewed" or "Mark as needs review"
  - "Open on GitHub"
  - CI state: "CI passed", "CI failed", "CI running", or "No checks"
- Remove the native `title` from these controls, so two tooltips do not show.
- Keep the accessible name of each control.
- No tooltip on "Open thread" and "Review in thread", because they show their text.

## Capabilities

### New Capabilities

### Modified Capabilities
- `pr-review-requests`: add a requirement for tooltips on the icon-only row controls.

## Impact

- `bb-plugin-github-insight/ui/review-queue-list.tsx` (`RowActions`, CI mark).
- Uses the host `@/components/ui/tooltip`, as `bb-plugin-tasks-plus/shell/topbar.tsx` does. No new dependency.
- `bb-plugin-github-insight/ui/pull-requests-panel.test.tsx`.
