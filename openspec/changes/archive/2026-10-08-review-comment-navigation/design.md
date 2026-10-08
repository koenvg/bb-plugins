## Context

- The Review tab (`bb-plugin-github-insight/ui/review-tab.tsx`) renders, in one scroll area: older comment drafts, outdated threads, then one `PrFileDiff` per file.
- `LazyFileDiff` mounts a diff only when its `<section>` is within 800px of the view (`useVisibleOnce`). A comment card in a far file is not in the DOM. Its file `<section>` is always in the DOM.
- `thread-placement.ts` already splits threads into `placed` (with side and line) and `outdated`. Drafts are split into `atHead` and `older` by `splitByCommit`.
- The Changes tab has `useFileNavigation` (`bb-plugin-changes/ui/use-file-navigation.ts`). It scrolls a `section[data-path]` to the top and keeps it there with a `ResizeObserver` until the user scrolls, presses a key, or 1s passes with no resize.
- Palette commands reach the Review tab through `postIntent` / `useCommandIntent` (`ui/command-intents.ts`). The "submit" intent waits until the review data is loaded.

## Goals / Non-Goals

**Goals:**

- One ordered list that a later comments sidebar can reuse without change.
- A jump that works for a comment whose diff is not mounted.

**Non-Goals:**

- Virtualizing the diff list.
- Mounting all diffs to make the jump simpler.

## Decisions

### D1: Pure ordered list in `core/`

`commentStops({ files, threads, olderDrafts, drafts, showResolved })` in `core/comment-stops.ts` returns `CommentStop[]`, each with `kind` (`thread` | `draft`), `id`, and `filePath` (the file section it shows in, or `null` above the files). It applies the order in the spec. Plain data, so it is unit tested without a DOM, and the later sidebar uses it as its rows.

Alternative: read the order from the DOM. Rejected, because unmounted cards are not in the DOM.

### D2: DOM anchors by data attribute

- Each file `<section>` gets `data-path`.
- Each thread card gets `data-review-thread-id`, each draft card gets `data-comment-draft-id`. Two attributes, because thread ids and draft ids come from different sources and can collide.
- The older-drafts and outdated cards are always mounted, so they only need the card attribute.

The position of a comment is the top of its card when it is mounted, and the top of its file section when it is not. This gives a position for every item without mounting diffs.

### D3: Current comment from the scroll position

`currentIndex` = first item in the list whose position is at or below the top of the scroll area (1px tolerance), else the last item. Compute it on scroll in one `requestAnimationFrame`, as `useFileNavigation` does. Do not compute it while a jump pins the view.

Next: if the current item is below the top, go to `current`, else to `current + 1`. An item whose card is not mounted, with its file section at or below the top, counts as below the top: the card is somewhere inside that file. Previous: if the current item is above the top (only when the view is past all comments), go to `current`, else to `current - 1`. Both wrap. While a jump pins the view, the pinned index is the current item and counts as at the top, because an unmounted card's file section can stand in for an earlier comment of that file.

Alternative: keep the last jumped index. Rejected by the user: it does not follow a manual scroll.

### D4: Two-step jump with a shared pin

1. Pin the target to the top. The target is the card when it is in the DOM, else its file `<section>`. Pinning the section makes the diff mount.
2. The mounted diff changes the content height. On each resize the pin resolves the target again, so it moves from the section to the card.
3. The card shows a 2px ring for about 1.5s, then the ring fades. The card starts its own timer when it mounts, so a late mount still shows the ring. No fade with reduced motion.

The pin logic moves out of `useFileNavigation` into `review-ui/` as `pinToTop(area, content, target, onStop)`. `target` is a function that is called on each align. It returns `stop()`. `useFileNavigation` calls it. The Changes tab keeps its behavior and tests.

Alternative: a `MutationObserver` that waits for the card. Rejected: the card mount always changes the content height, so the `ResizeObserver` already sees it.

Alternative: force-mount the target file. Rejected: diffs above it still load and move it, so a pin is needed anyway.

### D5: Palette commands use review intents

- Extend `IntentsByTab.review` to `"submit" | "next-comment" | "previous-comment"`.
- Add two `intentCommand` entries in `GITHUB_COMMANDS`, with no `defaultShortcut`.
- The Review tab keeps a requested step until the review is loaded, as it does for "submit", then runs it once.

### D6: Stepper in the header

The stepper sits after the count pills: `[ < ] 3 / 12 [ > ]` with icon buttons and tooltips "Previous comment" / "Next comment". The counter uses `tabular-nums` so the header does not move while it changes.

### D7: Inset for the sticky file header

The file header of a diff is sticky, so a card aligned to the top of the scroll area is under it. Every card aligns 8px below the top, plus the height of its file's sticky header when it is in a file diff. `stickyHeaderHeight(element)` in `review-ui/review-file-diff.tsx` reads the header from the open shadow root of `diffs-container`, because it is the only module that knows the `@pierre/diffs` DOM. "At the top" for the counter and for next/previous uses the same inset, so the comment that a jump lands on is the current comment.

## Risks / Trade-offs

- [The card mounts later than the 1s pin timeout on a slow machine] → Reset the timeout on each resize, as `useFileNavigation` does.
- [Several comments on one line have the same top] → Order on the page and in the list is the same. Use the list index as the tie-break.
- [The scroll-area height changes when the submit panel opens] → The current comment is read from positions relative to the scroll area, so the panel does not change it.
- [Moving the pin logic breaks the Changes tab] → Move it first, with no behavior change, and run the Changes tab tests before the new work.
