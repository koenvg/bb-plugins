# Tasks

## 1. Row control tooltips

- [x] 1.1 Add a small `IconTooltip` wrapper in `bb-plugin-github-insight/ui/` that wraps a trigger in the host `Tooltip` (300 ms delay, as in `bb-plugin-tasks-plus/shell/topbar.tsx`). Verify `bun run typecheck` (or the repo typecheck script) passes.
- [x] 1.2 In `review-queue-list.tsx`, wrap "Archive thread", the mark button, and the "Open on GitHub" link with the wrapper and remove their `title`. Keep `aria-label`. Verify the existing `getByRole(..., { name })` tests in `ui/pull-requests-panel.test.tsx` still pass.
- [x] 1.3 Wrap the CI mark with the wrapper, make it focusable with an accessible name equal to the CI text, and remove its `title`. Verify with a test that hovers or focuses the CI mark of a failed PR and sees "CI failed".
- [x] 1.4 Add tests in `ui/pull-requests-panel.test.tsx` for the spec scenarios: "Mark reviewed" and "Mark as needs review" tooltips on hover, "Open on GitHub" tooltip on focus, and no tooltip on "Open thread". Verify they pass.

## 2. Check

- [x] 2.1 Run the plugin test suite and typecheck, then open the Pull Requests panel in bb and hover each icon. Verify each tooltip shows after a short delay and no native tooltip shows.
