# Design

## Context

- `@pierre/diffs` lays out split view with `overflow: "wrap"` as a 4-track grid: `[number] [old code 1fr] [number] [new code 1fr]`. The code cells are subgrids, so an annotation contributes its own min-content width to the `1fr` track. A `1fr` track cannot get narrower than that. When a card has a long unbreakable line, the new-code track grows and the old-code track shrinks to about one character.
- `bb-plugin-github-insight/ui/file-diff.tsx` calls `FileDiff` directly and does not set `diffStyle`, so it gets the library default, `"split"`.
- `review-ui/review-file-diff.tsx` is the shared wrapper that the Changes tab uses. It needs `onAddComment` and always turns on the gutter utility.
- `review-ui/README.md` lists the tsconfig and vitest wiring that a plugin needs before it can import `../review-ui`. github-insight does not have this wiring yet.

## Goals / Non-Goals

**Goals:**

- One place (`ReviewFileDiff`) owns how annotations sit in the diff grid, for both plugins.
- Fix the layout without changing the diff library or its CSS.

**Non-Goals:**

- No unified/split toggle in the Review tab.
- No add-comment flow in the Review tab.
- No change to the card designs.

## Decisions

### Wrap each annotation in an element with `contain: inline-size`

`ReviewFileDiff` wraps the result of `renderAnnotation` in a `<div style={{ contain: "inline-size" }}>`. Inline-size containment makes the element's min-content width zero, so the annotation no longer adds to the track size. The div is a block, so it then stretches to the track width that the code lines set.

- Use an inline `style`, not the Tailwind class `[contain:inline-size]`. A Tailwind class only works if the plugin's Tailwind build scans `../review-ui`. That is not confirmed, and an inline style has no such dependency.
- Alternative: `min-w-0` / `max-w-full` on the card. Rejected: these do not change the min-content contribution of a subgrid item to a `1fr` track, so the track still grows.
- Alternative: override the library's `--diffs-code-grid` to `minmax(0, 1fr)`. Rejected: this depends on private CSS variables in `@pierre/diffs`, and it changes the code line layout as well.

### Code blocks scroll inside the review card

`ReviewThreadCard` adds `[&_pre]:overflow-x-auto` to the element around `<Markdown>`. After containment, the card is exactly as wide as the column, and the card has `overflow-hidden`, so a wide `pre` would get cut off without this class. The class is in github-insight source, so the plugin's own Tailwind build picks it up.

`CommentDraftCard` shows its body in a textarea, not as Markdown, so it needs no change. `PendingCommentCard` already uses `whitespace-pre-wrap break-words`, so it needs no change.

### `onAddComment` becomes optional

When `onAddComment` is `undefined`, `ReviewFileDiff` sets `enableGutterUtility: false` and passes no `onGutterUtilityClick`. The Changes tab still passes a handler, so its behavior stays the same.

### github-insight uses `ReviewFileDiff` with `view="split"`

`LazyFileDiff` keeps its lazy-visibility logic and annotation building. Only the `FileDiff` call changes to `ReviewFileDiff`, with `headerMetadata={<ThreadCount count={threads.length} />}`. The `key` props in `renderAnnotation` stay as they are.

## Risks / Trade-offs

- [A card that relied on its own content width now fills the column] → All current cards are already full-width blocks with `mx-2`. Check both tabs by eye.
- [jsdom does not do layout, so unit tests cannot prove the column widths] → Unit tests check that annotations are inside the containment wrapper and that the gutter is off when there is no handler. The layout is checked by hand in bb on a PR with a wide code-block comment.
- [github-insight tests mock `@pierre/diffs/react`. If `review-ui` resolves a different copy, the mock does not apply] → Add `@pierre/diffs` and `@testing-library/react` to `resolve.dedupe`, and add the `paths` entries, as the README says.
