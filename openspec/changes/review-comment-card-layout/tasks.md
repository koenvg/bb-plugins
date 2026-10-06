# Tasks

## 1. Shared diff component

- [x] 1.1 In `review-ui/review-file-diff.tsx`, wrap each `renderAnnotation` result in a `div` with `style={{ contain: "inline-size" }}`. Add a test to `review-ui/review-file-diff.test.tsx` (extend the `FileDiff` mock to call `renderAnnotation`) that checks the annotation is inside an element with `contain: inline-size`.
- [x] 1.2 Make `onAddComment` optional. When it is absent, pass `enableGutterUtility: false` and no `onGutterUtilityClick`. Add a test that checks the gutter is off with no handler and on with a handler.
- [x] 1.3 Run `npm test` and `npm run typecheck` in `bb-plugin-changes`, and verify both pass with no Changes tab test edits.

## 2. github-insight wiring

- [ ] 2.1 Add the `../review-ui` wiring from `review-ui/README.md` to `bb-plugin-github-insight`: `"../review-ui"` in tsconfig `include`, `paths` for `react`, `react/*`, `@pierre/diffs`, `@pierre/diffs/react`, `vitest`, `@testing-library/react`, plus `resolve.dedupe`, `server.fs.allow: [".."]` and `test.include` in `vitest.config.ts`. Verify `npm run typecheck` and `npm test` pass in `bb-plugin-github-insight`.

## 3. Review tab uses the shared diff

- [ ] 3.1 In `bb-plugin-github-insight/ui/file-diff.tsx`, replace the direct `FileDiff` call in `LazyFileDiff` with `ReviewFileDiff`, using `view="split"`, no `onAddComment`, and `headerMetadata={<ThreadCount count={threads.length} />}`. Update the `@pierre/diffs/react` mock in `ui/review-tab.test.tsx` if needed, and verify that threads and drafts still render on their lines, the diff is split, and there is no gutter utility.
- [ ] 3.2 In `bb-plugin-github-insight/ui/review-thread.tsx`, add `[&_pre]:overflow-x-auto` to the element around `<Markdown>` in `CommentView`. Add a test that checks the class is on that element.
- [ ] 3.3 Run `npm test`, `npm run typecheck` and `npm run lint` in `bb-plugin-github-insight`, and verify all pass.

## 4. Integration check

- [ ] 4.1 Build and load both plugins in bb. Open the Review tab on a PR with a review comment that has a wide code block on a new-side line. Verify by screenshot that the old code column keeps its normal width and the code block scrolls inside the card. In the Changes tab, add a pending comment with a long path and verify the diff columns stay the same width.
