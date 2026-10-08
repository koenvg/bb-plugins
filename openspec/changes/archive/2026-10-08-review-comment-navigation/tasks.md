# Tasks

## 1. Shared pin logic

- [x] 1.1 Move the pin logic from `bb-plugin-changes/ui/use-file-navigation.ts` into `review-ui/` as `pinToTop(area, content, target)` that returns `stop()` and can change its target (design D4); make `useFileNavigation` call it; verify the existing Changes tab tests pass with no change to the tests
- [x] 1.2 Add unit tests for `pinToTop` with a fake `ResizeObserver`: it aligns at once, re-aligns on resize, moves to a new target, and stops on `wheel`, `keydown`, and the settle timeout; verify they pass

## 2. Ordered comment list

- [x] 2.1 Implement `commentStops` in `bb-plugin-github-insight/core/` (design D1) and verify unit tests for each spec scenario of "Comments are in page order": older drafts, outdated threads, file order, line order, old side before new side, threads before drafts, and the "Show resolved" switch

## 3. Stepper in the Review tab

- [x] 3.1 Add `data-path` to each file `<section>` in `ui/file-diff.tsx`, `data-review-thread-id` to thread cards, and `data-comment-draft-id` to comment draft cards (design D2); verify with a review-tab test that the attributes are in the DOM
- [x] 3.2 Add a hook that computes the current index from the scroll position (design D3) and verify tests with stubbed offsets: a manual scroll updates it, an unmounted comment uses its file position, and nothing at or below the top gives the last item
- [x] 3.3 Add the two-step jump with the highlight (design D4) and verify tests: a jump to an unmounted card pins the file, then the card when it mounts, then removes the highlight; a `wheel` event stops the pin; a draft being edited keeps its text
- [x] 3.4 Add the stepper to the header (design D6) and verify tests for the spec scenarios of "Comment stepper in the header" and "Next and previous go from the scroll position", including wrap at both ends
- [x] 3.5 Document the stepper in the Review tab part of `bb-plugin-github-insight/README.md` and verify the text matches the spec

## 4. Palette commands

- [x] 4.1 Add the `next-comment` and `previous-comment` review intents and the "GitHub: Next comment" and "GitHub: Previous comment" commands with no default shortcut (design D5); verify tests in `ui/commands.test.tsx` that they are available only with a PR and that they open the Review tab and post the intent
- [x] 4.2 Run a requested step once after the review loads, and verify a review-tab test: an intent posted before load jumps after load; an intent with no comments does not scroll
- [x] 4.3 Add both commands to the "Command palette" section of `bb-plugin-github-insight/README.md` and verify the list matches `GITHUB_COMMANDS`

## 5. Integration

- [x] 5.1 Reload the plugin and, on a PR with 90+ files, drafts, and open threads, verify in the running app: the counter follows a manual scroll, next and previous wrap, a jump to a far file lands on the card after diffs load, and the palette commands work with the Review tab closed
