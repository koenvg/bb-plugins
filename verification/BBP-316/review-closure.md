# Review finding closure

The original independent review remains unchanged in [independent-review.md](independent-review.md). Its verdict requested changes. The parent accepted and closed all three findings by inspecting the fixes and rerunning affected checks. This is not a second independent approval.

## P1. Overlapping refresh bypass

`creator-threads.ts` now shares one in-flight lookup per creator. A second status write awaits the same lookup instead of replacing its token and resuming against an old clear cache. Lifecycle events still invalidate an older read, and disposal still suppresses writes.

The new public-handler test starts two todo updates from an old archived cache, resolves the first SDK read as unarchived, and holds any second SDK read unresolved. Both writes must refuse, and the stored title and backlog status must remain unchanged. It failed before the fix and passes after it.

## P2. Ambiguous source backfill

`db/schema.ts` now examines every Source candidate and extracts all bbthread references case-insensitively. Every extracted reference must have the supported scheme and a valid thread ID. A malformed second reference cannot be ignored in favor of the first.

New tests cover a mixed-case second URI, a malformed second Source line and a malformed second URI on the same line. All failed before the fix and pass after it. Existing migration byte-preservation and one-time checks still pass.

## P2. Hidden board refusal

`views/board/index.tsx` now displays the server error in an alert and reloads the stored board after a rejected move. The same commit path serves pointer drags and keyboard status changes. Network failures also show their error instead of silently refreshing.

A keyboard regression verifies that the creator ID is visible and the card returns to its original column. A new Chromium case performs a real pointer drag, verifies refusal and unchanged fixture storage, then archives the creator and moves the card successfully through its keyboard menu.

## Final checks

- Regression red run had five failing tests. The fixed focused run passed 33 tests.
- Full Tasks suite passed 132 files and 1479 tests.
- All 35 browser cases passed, including detail desktop/narrow and board pointer/keyboard paths.
- Typecheck, lint, formatting, SDK matching and the production build passed.
- Installed acceptance was not run or authorized. Browser task transport is a substitute, not installed behavior.

See the linked logs and captures in [report.md](report.md).
