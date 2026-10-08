# BBP-178 synthetic popover verification

Starting commit: `53803e502410214c5aa4047229219de834bee494`. The checkout was clean.

## Initial fixture change

The shared HTML fixture now defines `--popover: oklch(0.195 0 0)` and `--popover-foreground: oklch(0.81 0 0)`. These are the established dark theme canvas/ink values in BB's `apps/app/src/components/ui/theme.css`, inspected at BB commit `fdd3de3b19b97e6cd1ef7300cbb54711431249d3`.

The existing browser driver records computed tooltip background, alpha, ancestor opacity and WCAG contrast for every non-empty text node's color, including muted text. It requires opaque backgrounds and opacity 1, plus at least 4.5:1 contrast. Canvas converts computed OKLCH colors to sRGB for measurement. Existing exact values, keyboard/pointer checks, accessibility, bounds and resource ownership checks remain intact. No live plugin code or second chart was added.

## Verified checks

- Negative check before adding tokens failed with `rgba(0, 0, 0, 0)` and background alpha 0.
- Early partial-state preview passed at 1280px and 375px. Both cost screenshots were inspected. Chart content does not show through the tooltip.
- Full calendar browser suite passed all 26 state/width combinations and produced 52 decoded PNG captures. All 40 active metric/width/state tooltip measurements had alpha 1 and opacity 1. Minimum text contrast was 8.9058:1.
- Money browser suite passed 18 state/width combinations, excluding the existing failing `tiny` state. It produced 36 decoded PNG captures with the same opacity and contrast checks.
- Owned resource regression tests passed, 3 tests. Successful browser receipts confirm task-created tabs were closed. Existing runner cleanup and resource ownership code is unchanged.
- `npm run lint`, `npm run format:check`, `npm run typecheck`, `bb plugin types --check`, `bb plugin build`, `npm run test:bundle` and `git diff --check` passed.

## Existing gate failures

- Offline preview tests: 9 passed, 2 failed. Both failures reproduced on the starting commit. Stale AX and pointer fixtures are recorded in BBP-179.
- Full money suite fails its existing tiny-cost axis gap check at desktop: 5.4388px versus the required 8px. The same failure reproduced on the starting commit. Recorded in BBP-180. Recorded tooltip opacity and contrast measurements met the limits, but their assertions did not run because the axis assertion failed first.
- Full Vitest with two workers: 737 passed, 6 failed in `report-preparation-routing.test.ts`. The same six failures reproduced on the starting commit. The default-worker run also had one identity-retention timeout; that test passed with two workers. No unrelated fixes were made.

These failures leave the full validation gate incomplete. Independent read-only review found no blocking code issues. It verified source hashes, all 88 successful screenshot receipts, opacity and contrast. Its evidence wording correction is included here. Merge readiness remains on hold until the full required validation gate is resolved.

## Evidence

[Complete receipts and logs](/Users/koen/.bb/artifacts/bbp178.CR0qzj/)

- [Desktop cost screenshot](/Users/koen/.bb/artifacts/bbp178.CR0qzj/calendar/calendar-1280-partial-cost.png)
- [375px cost screenshot](/Users/koen/.bb/artifacts/bbp178.CR0qzj/calendar/calendar-375-partial-cost.png)
- [Desktop token screenshot](/Users/koen/.bb/artifacts/bbp178.CR0qzj/calendar/calendar-1280-partial-tokens.png)
- [375px token screenshot](/Users/koen/.bb/artifacts/bbp178.CR0qzj/calendar/calendar-375-partial-tokens.png)
- [Calendar checks](/Users/koen/.bb/artifacts/bbp178.CR0qzj/calendar/checks.json)
- [Source hashes](/Users/koen/.bb/artifacts/bbp178.CR0qzj/source-hashes.txt)

Each runner built `calendar-preview.tsx` from this checkout with Bun and used this checkout's built `dist/app.css`. RPC data, hosts and time were synthetic. The runners used fresh default-browser connections, task-created tabs and token-marked loopback resources. No installed source switch, reload, real account, native input, collection or billing check was run.

This is synthetic proof only, not installed BB behavior proof.

## User-approved tooltip simplification

After the fixture review, the user approved removing the entire lower tooltip section. `UsageTooltip` now shows only the date and exact values, including separate uncertain token estimates and nonzero exclusions. Coverage, pricing counts, the billing note and duplicate-check text are removed from the tooltip and its reused selected-date view. Calculations, report requests and the accessible daily table are unchanged. This presentation change is a separately approved extension to BBP-178's original fixture-only scope.

- Test-first checkpoint: 7 focused tests failed before removing the section; all 21 focused layout/date-picker tests passed afterward. Tests retain unknown-versus-zero values and the table's coverage, pricing and billing details.
- Fresh calendar browser checks passed all 26 state/width combinations. Money checks passed 18 combinations excluding `tiny`. All recorded tooltip footer paragraph lists were empty. The 68 active tooltip measurements retained opacity 1, background alpha 1 and minimum contrast 8.9058:1. Both desktop and 375px cost screenshots were inspected.
- Lint, formatting, TypeScript, SDK types, build, full bundle checks and the 3 ownership tests passed again.
- Full Vitest again had 737 passing tests and the same 6 routing failures. Offline preview tests again had 9 passing tests and the same 2 stale-fixture failures. The tiny-cost browser state still failed its existing axis gap check. Full validation remains incomplete; no unrelated fixes were made.

[Updated receipts and source hashes](/Users/koen/.bb/artifacts/bbp178-tooltip.TgAEh5/). [Desktop tooltip](/Users/koen/.bb/artifacts/bbp178-tooltip.TgAEh5/calendar/calendar-1280-partial-cost.png). [375px tooltip](/Users/koen/.bb/artifacts/bbp178-tooltip.TgAEh5/calendar/calendar-375-partial-cost.png).

Independent read-only review of this new change found no blocking implementation issues. The reviewer verified all 8 source hashes, 88 PNG receipts and 68 theme measurements. Merge readiness remains on hold because full required validation still fails. These previews are synthetic only. Installed behavior and native input were not tested.
