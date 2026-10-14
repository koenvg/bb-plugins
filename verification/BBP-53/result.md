# BBP-53 delivery 1 handoff

Implementation for 1.1–1.11 is present against baseline `939bd318cedb00239b73e1fd1c3d5d90c79ada70`. This is not acceptance or a claim that every task is complete. Real-host authentication denial is **BLOCKED**, as approved by the supervisor. The parent owns checklist changes, the single independent review, and acceptance.

## Delivered boundary

- Private compiled `packages/markdown-document` exports only its root interface and CSS. `DocumentView` and deny-only `DestinationPolicy` render semantic baseline GFM, plain code, exact Raw, and inert destinations, including generated footnotes. HTML/MDX do not execute. React remains consumer-owned.
- Authenticated saved-ID route returns a `PreviewSnapshot`, with one confined descriptor, actual-stat checks, bounded reads, a 1 MiB limit, fatal UTF-8, preserved BOM/CRLF, binary-control rejection, and static errors. Upload, original download, deletion, and CLI behavior remain intact.
- A keyed task owner uses discriminated `PreviewState`, a private request ticket, and a separate focus session. Close, replacement, retry, removal, task change, and unmount invalidate outstanding work. Confirmed successful lists control removal; undefined loading/error data does not close an existing preview.
- Eligible filename controls open the vendored Dialog with stable Preview/Raw/Download/Close controls, Retry where applicable, and guarded trigger or task-control focus restoration. Compact close autofocus is forwarded through the existing primitive.
- The supervisor approved the minimal shared shortcut safeguard: inactive `[hidden]`, `[inert]`, or `[aria-hidden=true]` ancestors no longer count as open overlays. All active dialog/alertdialog/menu/listbox roles and overlapping active overlays still suppress task shortcuts.
- A viewport-bounded modal and flex scroll body reserve the same loading/content geometry. Compact keyboard inset remains part of the height calculation.
- Tasks CI alone bootstraps the shared package before consumer installation. Build, browser fixture tooling, and attachment documentation describe the same bounded workflow. Existing production Markdown Reader and OpenSpec checkboxes are untouched.

## Final checks

| Evidence                 | Result                                                                                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `full-checks-final.log`  | Shared build, 4 compiled-public-interface tests, shared typecheck; Tasks frozen install, 124 files / 1278 tests, Tasks typecheck, SDK type check, plugin build passed                                     |
| `ui-browser-final.log`   | 6 generic browser tests passed at 1280px and 390px, including loading-to-ready geometry equality and reachable controls in empty/error states                                                             |
| `quality-final.log`      | Scoped lint, format check, 8 environment-setup tests, diff whitespace check, and empty staging check passed                                                                                               |
| `clean-build.log`        | Fresh checkout frozen installs; shared build/4 tests/typecheck; Tasks typecheck/78 focused tests/build/SDK check; 6 browser checks; independently bundled code/CSS and consumer-owned React checks passed |
| `shortcut-close-fix.log` | 70 focused shortcut/preview/full-task tests, typecheck, and the earlier 2 browser checks passed before the later geometry assertions were added                                                           |
| `environment.log`        | Bun 1.4.3, Node 24.15.0, baseline hash recorded; SDK check and bundle metadata report 0.6.37                                                                                                              |

Lint has four pre-existing warnings in `api/index.ts`, `attachments/index.ts`, `shell/keyboard.test.tsx`, and `views/list/list-preference.ts`. No new warning or lint error remains.

The latest retained clean checkout is `/var/folders/5f/jlmxmscj0gnb0h9z6j5by_rr0000gn/T/bbp53-clean-jz4vPB/checkout`. The script restores the final shortcut source after its deliberate red reproduction. It deliberately leaves one failing shared-test sentinel in that disposable checkout to prove shared failure stops consumer bootstrap; it does not alter that test in this worktree. The two failing runs in the final clean log are expected: original baseline shortcut behavior fails compact recovery, and the injected sentinel fails the shared test gate. The script itself exits successfully. No checkout cleanup ran.

## Browser evidence and inspection boundary

The fixture uses the actual attachment grid, owner, vendored Dialog, shared document, and shortcut provider with synthetic local transport under StrictMode. It does not substitute another reader and does not create live records.

- `early-{1280,390}.png/.json` were captured and inspected early. `pre-stability-{1280,390}.png/.json` retain the second inspected capture before the prescribed stable-height correction.
- The supervisor approved refreshed `final-{1280,390}.png/.json` for independent parent inspection, without another child self-polish loop. The child has **not** claimed visual inspection of those refreshed PNGs.
- Final JSON records show desktop 960px panel / 720px prose, compact 388px panel / 356px prose, 16px text / 28px line height, local code overflow, no page overflow, reachable controls, and a 2px keyboard outline. Panel, toolbar, and body rectangles are identical in Loading and Ready at each width. Panel heights are 852px desktop and 741px compact; empty/error assertions verify the same heights.
- Keyboard assertions cover activation, trapping, Escape, Close, removal fallback, shortcut suppression and recovery, draft/scroll preservation, exact Raw, and inert external traffic. Full Tasks jsdom tests separately verify real ProseMirror draft input, editor identity, an existing in-flight save, route, scroll, workflow, and no extra writes.
- Playwright 1.64's expected Chromium revision 1248 was unavailable locally. Checks used the existing headless Chromium revision 1243 through `PLAYWRIGHT_CHROMIUM_EXECUTABLE`; no browser installation ran. CI remains configured to install its pinned Playwright browser normally.
- `impeccable-detector.json` is `[]`. The detector ran exactly once after the initial UI completion, before the later focus/shortcut/stability corrections; it was not rerun, per instruction. Final source has independent lint/typecheck/build/browser checks instead.

Screenshots are inspection artifacts, not equivalents of test assertions. The generic fixture is not proof of installed-host UI, authorization, full-task browser editor behavior, mobile software-keyboard/IME behavior, or all error states. GitHub Actions itself has not been executed; its fail-fast command sequence was checked in the disposable checkout.

## Residual blocker and controls

Fake-host registration tests prove explicit `auth: "local"`, but bypass middleware and do not prove denial. A real SDK-host unauthenticated denial probe requires approval to install the exact checkout; no such approval was given. Do not mark 1.4 complete from this handoff.

No installed plugin changes, enabling, live test records, commits, PRs, task/status writes, OpenSpec checkbox changes, or child agents were performed. Frozen Bun instead of `npm ci` was explicitly approved. Temporary dependencies and checkouts remain. Parent review and acceptance are pending.
