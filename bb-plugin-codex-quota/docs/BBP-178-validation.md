# BBP-178 synthetic tooltip verification

Original implementation baseline: `53803e502410214c5aa4047229219de834bee494`. Validation-fix baseline: `fab186cd8d9f8f67f4f4e8f919e33f78f566d1da`. Both starting checkouts were clean.

## Approved changes

- Add `--popover: oklch(0.195 0 0)` and `--popover-foreground: oklch(0.81 0 0)` to the shared HTML fixture. These match BB's dark canvas/ink values in `apps/app/src/components/ui/theme.css`, inspected at BB commit `fdd3de3b19b97e6cd1ef7300cbb54711431249d3`.
- Remove the entire lower tooltip section after explicit user approval. Date and exact values remain, including separate uncertain estimates and nonzero exclusions. Calculations, requests and the accessible daily table's coverage, pricing and billing details remain unchanged. The selected-date view reuses this tooltip.
- Fix the remaining validation failures after a further user request. Update offline AX and pointer fixtures to the current contracts and widen the existing Y axis from 80px to 84px. No second chart, new dependency or unrelated fix was added.

The browser driver records computed background alpha, ancestor opacity and WCAG contrast for every non-empty tooltip text node's color, including muted text. It requires an opaque background, opacity 1 and at least 4.5:1 contrast. Canvas converts computed OKLCH colors to sRGB. Exact values, independent keyboard/pointer checks, accessibility, layout bounds and resource ownership checks remain intact.

## Resolved validation failures

- The six routing-test failures were caused by my local setup, not routing code. I installed dependencies with `--ignore-scripts`, leaving the native `better-sqlite3` binding unavailable. The same setup caused the baseline reproduction to fail. `npm rebuild better-sqlite3` restored the SDK fixture's database; all seven routing tests now pass without routing-code changes. Do not skip dependency install scripts when running these SDK tests.
- Offline fixtures lacked the uncertain-token AX column and still returned old tooltip paragraphs instead of the current `time` and definition-list facts. They now match both metrics. Negative tests require the specific no-op-hover or wrong-value failure, rather than passing on an unrelated missing-selector error. BBP-179 records this fix.
- The tiny-cost axis gap was 5.4388px. Widening the existing axis by 4px gives 9.4388px at both 1280px and 375px, above the unchanged 8px limit. The exact `$5e-324` value remains intact. BBP-180 records this fix.

## Verified checks

- Full `npm test`: all 743 tests in 70 files pass with the default worker settings.
- Offline preview regressions: all 11 tests pass, including the 3 resource-ownership tests. Missing/misplaced AX facts, no-op hover and incorrect hover values still fail as intended.
- Full calendar browser suite: all 26 state/width combinations pass, with 52 decoded PNG receipts.
- Full money browser suite, including `tiny`: all 20 state/width combinations pass, with 40 decoded PNG receipts.
- All 72 active tooltip theme measurements have background alpha 1 and opacity 1. Minimum text contrast is 8.9058:1. All recorded lower-footer paragraph lists are empty.
- Desktop and 375px tiny-cost screenshots were inspected. The axis label and tick have enough space; the tooltip is opaque, bounded and has no lower section.
- Lint, formatting, TypeScript, SDK types, build, all bundle checks and diff checks pass.
- Successful browser ownership receipts confirm both task-created tabs were closed. Cleanup code is unchanged.
- Initial PR commit `fab186cd8d9f8f67f4f4e8f919e33f78f566d1da` passed all GitHub CI jobs. The validation-fix commit's CI result is recorded in PR #173 and the task thread.

Independent read-only review approved the validation fixes with no blocking findings. The reviewer reran all 743 Vitest tests and 11 offline tests, verified 7 source hashes, 92 PNG receipts and 72 theme measurements, and inspected both tiny-cost screenshots. Earlier fixture and tooltip implementation reviews also found no blocking code issues. Local validation and implementation review are complete. CI results for the validation-fix commit are recorded in [PR #173](https://github.com/koenvg/bb-plugins/pull/173) and the task thread.

## Evidence

[Current receipts, source hashes and logs](/Users/koen/.bb/artifacts/bbp178-validation.gZ8t91/)

- [Desktop tiny-cost tooltip](/Users/koen/.bb/artifacts/bbp178-validation.gZ8t91/money/money-1280-tiny-cost.png)
- [375px tiny-cost tooltip](/Users/koen/.bb/artifacts/bbp178-validation.gZ8t91/money/money-375-tiny-cost.png)
- [Calendar checks](/Users/koen/.bb/artifacts/bbp178-validation.gZ8t91/calendar/checks.json)
- [Money checks](/Users/koen/.bb/artifacts/bbp178-validation.gZ8t91/money/checks.json)

Historical receipts remain in the BBP-178 attachments `bbp178.CR0qzj-reviewed.zip` and `bbp178-tooltip.TgAEh5-reviewed.zip`. Their validation-hold statements are superseded by this report. The original transparent fixture failed the new alpha check before the tokens were added. The tooltip-removal test-first checkpoint failed seven focused tests before the change and passed all 21 afterward.

Both runners built `calendar-preview.tsx` from this checkout with Bun and used its built `dist/app.css`. Hosts, time and RPC data were synthetic. Fresh default-browser connections, task-created tabs and token-marked loopback resources were used. No installed source switch, reload, native input, real collection or billing checks were run.

This is synthetic proof only, not installed BB behavior proof.
