# Tasks

## 1. File order

- [x] 1.1 Add `compareFilePaths` in `core/file-order.ts` (design Decision 1); verify unit tests: folder before file at the same level (`src/ui/a.ts` before `src/b.ts` before `README.md`), names sort within a level, equal paths compare as 0
- [x] 1.2 Sort the sections in `ChangesTab` with `compareFilePaths`; verify a tab test: the environment returns `README.md`, `src/b.ts`, `src/ui/a.ts` and the sections show as `src/ui/a.ts`, `src/b.ts`, `README.md`
- [x] 1.3 Use `compareFilePaths` in `sortComments`; verify `review-prompt.test.ts`: a comment on `src/ui/a.ts` comes before one on `src/b.ts`, and line and side order inside a file stay the same
- [x] 1.4 Update the file order text in `README.md` ("The Changes tab" and "Send feedback"); verify the README states folder-first order for sections and the prompt

## 2. Tree model

- [x] 2.1 Add `buildFileTree(files)` in `core/file-tree.ts` (design Decision 2); verify unit tests: `src/ui/lib/a.ts` + `src/ui/lib/b.ts` give one folder row `src/ui/lib` with two file rows at depth 1, a root file has depth 0, a folder with two child folders does not merge, a renamed file shows at its new path

## 3. Outline UI

- [x] 3.1 Add `ui/file-outline.tsx` with `<nav aria-label="Files">`, folder rows, and file rows with name, `DiffStat`, comment count above 0, and the full path as `title` (design Decisions 3 and 6); verify a tab test: the rows, counts, and comment count show for a 2-file diff with 2 comments on one file
- [x] 3.2 Change the `ChangesTab` layout to `@container`, with the outline as `hidden @3xl:block w-60` beside the scroll area, rendered only for an `ok` result with files; verify tab tests: no `Files` navigation for loading, error, "no git", and "No changes", and `npm run typecheck` passes
- [x] 3.3 In the running app, open the Changes tab in a panel narrower and wider than 768px; verify the outline hides and shows without a reload, and long names truncate with an ellipsis

## 4. Jump and current file

- [x] 4.1 Add `jumpTo` in `useFileNavigation` (design Decision 4) and call it from file rows; verify tab tests with stubbed offsets and a fake `ResizeObserver`: a click sets `scrollTop` to the section offset, a resize after the click re-pins it, a `wheel` event stops the pin, and a folder row click does not scroll
- [x] 4.2 Add `current` in `useFileNavigation` (design Decision 5) and mark the row with `aria-current="true"`; verify tab tests with stubbed section tops: a scroll into the second section marks its row and unmarks the first, and a jump marks the clicked row at once
- [x] 4.3 Scroll the marked row into the outline's view with `block: "nearest"` when it is outside; verify a tab test that `scrollIntoView` is called on the marked row only when its rect is outside the outline rect
- [x] 4.4 Update `README.md` with an "Outline" part: shows at 768px or wider, click to jump, current file mark, comment counts; verify the text matches the behavior in the running app

## 5. Integration

- [x] 5.1 In the running app, open a thread with 20 or more changed files, click a file far down, and scroll; verify the file lands at the top with no drift, the mark follows the scroll, and inline comments still work
- [x] 5.2 Run `npm test`, `npm run typecheck`, and `bb plugin build` in `bb-plugin-changes`, and `openspec validate changes-file-outline --strict`; verify all pass
