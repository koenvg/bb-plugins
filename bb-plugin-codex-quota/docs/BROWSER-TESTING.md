# Synthetic browser verification

Run from `bb-plugin-codex-quota/` with Bun 1.4.3. Vitest also needs Node 24.15 or newer within Node 24:

```sh
bun install --frozen-lockfile
bun --bun run playwright install chromium
bun run test:browser
bun run test
bun run typecheck
```

`@playwright/test` is locked to 1.64.0. `bun run test` remains Vitest. Its default exclusions are retained, with only `scripts/browser/**/*.spec.ts` added. `proof.test.ts` remains in Vitest.

No Python, Pillow, Browser Use, Bun, BB CLI or prebuilt `dist/` is required for browser checks. The `.mjs` bundle checks remain separate backend verification. `test:bundle` also runs the actual built-entry speed/native proof.

## Ownership and local resources

Playwright launches its own Chromium, creates fresh test contexts, and closes them. No existing browser profile, login, tab, or daemon is used. `bun run test:browser` starts this checkout's preview before Playwright loads its config. The preview binds `127.0.0.1` port `0` once and reports its actual bare origin. The runner retains that listener for the tests. Raw `playwright test` calls have no fixture handoff and fail.

The preview builds fixtures into a fresh `codex-quota-preview-*` directory below the runner's fresh temporary parent. On success, test failure, startup failure, or cancellation, the runner stops its owned process groups before removing only that parent. Browser reports and historical receipts remain. Direct previews own and remove their own fresh temporary directory. Nothing builds into product `dist/`.

Direct previews also default to port `0` and print the actual URL. To request a specific port, use `CODEX_QUOTA_PREVIEW_PORT=38716 bun scripts/preview-server.mjs`. The same override applies to `bun run test:browser`. Values must be integers from `0` through `65535`. Empty or malformed values fail. An occupied explicit port fails without reusing or replacing the existing server.

Only the six fixture HTML/JavaScript pairs and generated CSS are served. The server CSP blocks external connections. Each test context also blocks and fails any non-local browser request. The official usage link is inspected and focused, never followed.

Separate worktrees have separate default browser evidence paths. Concurrent runs in one checkout, or runs with the same explicit `--output`, can still overwrite evidence. POSIX process groups are required. SIGKILL of the runner and host crashes cannot run cleanup.

From the repository root, `bun scripts/verify-concurrent-browser-worktrees.mjs /tmp/bbp-196` creates two owned verification worktrees. It runs concurrent Chromium cases for all three plugins, checks each changed checkout marker and actual origin, retains evidence, and removes only those worktrees. It reuses installed locked dependencies. It does not install browsers or retry suites.

The CSS compiler uses the BB Tailwind 4.3 theme/utility layer pattern without preflight, fixture theme aliases and the existing HTML dark theme. This is synthetic fixture CSS, not acceptance of BB's packaged CSS build or installed theme. The public SDK calendar renderer needs React's development build for `act`. All hosts, RPCs, clocks and datasets are synthetic.

## Coverage mapping

Every matrix keeps both 1280px desktop and 375px narrow checks. State filters are diagnostic only.

`tooltip-input.spec.ts` adds a metric-switch regression with deferred browser frames and token/cost regressions that move the chart down 60px during keyboard input. The pointer driver uses locator hover to resolve the bar's current position after layout changes. The driver clears pointer selection in the chart margin and waits for rendered input frames before reading keyboard results. The regression keeps real input handlers, checks that queued pointer work finishes before keyboard input, and still requires hover to restore the target date with exact facts.

| Removed runner                 | Maintained suite and retained checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check-activity-preview.py`    | `activity.spec.ts`: early collapsed/open desktop and narrow screenshots, one disclosure read, Enter/Space, keyboard table scroll, local weekly switch, stop-read window, no overflow, focusable official link and layout JSON.                                                                                                                                                                                                                                                                             |
| `check-calendar-preview.py`    | `calendar.spec.ts`, `calendar` cases: 13 states at both widths and both metrics. States are partial, unknown, inactive, expired, huge, stale, unavailable, loading, retry, latest, selection, cancel and settings. Exact values/coverage/exclusions, no metric RPC, date and numeric axes, settled width, spacing/containment, opaque AA-contrast tooltip, independent hover, complete AX facts, bounded navigation, retry/latest recovery, pending selection, late responses and management close/reopen. |
| `check-money-preview.py`       | `calendar.spec.ts`, `money` cases: 10 states at both widths and both metrics. States are partial, no-prices, tiny, huge, expired, unknown, inactive, stale, unavailable and loading. Exact captured dollars, smallest positive estimate, missing prices and inactive cost stay distinct; same layout, AX, keyboard/hover and no-RPC requirements.                                                                                                                                                          |
| `check-date-picker-preview.py` | Removed with the date inspector. `calendar.spec.ts` retains the 30 dated rows, exact values, coverage, keyboard and hover tooltip checks. `mobile-layout.spec.ts` verifies the inspector is absent and the compact arrows retain 44px coarse-pointer hit areas.                                                                                                                                                                                                                                            |
| `check-collector-preview.py`   | `management.spec.ts`, `collector`: collapsed/open desktop and narrow screenshots, explicit install, partial workspace totals, pause/resume/repair, action counts, readiness without action, keyboard close, retained official link and no overflow.                                                                                                                                                                                                                                                        |
| `check-identity-preview.py`    | `management.spec.ts`, `identity`: complete/partial states at both widths, Enter exact-thread and Space archived callbacks, missing/deleted non-links, removal of old exact rows during partial discovery, retained workspace totals and link.                                                                                                                                                                                                                                                              |
| `check-import-preview.py`      | `management.spec.ts`, `import`: stopped/frozen scope at both widths, trusted keyboard Resume, disabled Start/source root, readable wrapping and link focus.                                                                                                                                                                                                                                                                                                                                                |
| `check-retention-preview.py`   | `management.spec.ts`, `retention`: 22 cases. Five health states plus six legacy phases at both widths. Health initially collapsed, expired classes unavailable, recovery gap, pause/resume, readiness action counts, quota/link, explicit stopped-writer checkbox consent and blocked warning.                                                                                                                                                                                                             |
| `check-storage-preview.py`     | `management.spec.ts`, `storage combined`: 28 cases. Five health states, six legacy phases and configured/completed/canceled import at both widths. Frozen source/save controls, Resume/Cancel reachability, synthetic thread callback, quota/link and no overflow.                                                                                                                                                                                                                                         |
| `preview_browser.py`           | `calendar-driver.ts`, `chart-layout.ts` and `proof.ts`: exact daily DOM/AX facts, independent keyboard/real hover receipts, layout/contrast, selection/recovery/settings interactions and call limits. Shared `fixtures.ts` owns external-traffic and browser-error assertions and screenshot receipts.                                                                                                                                                                                                    |
| `preview_resources.py`         | `playwright.config.ts` and `preview-server.mjs`: fresh browser/context and temporary build ownership, local server/CSP, no reuse; `fixtures.ts` fully decodes PNGs, rejects solid pixels and records dimensions/SHA-256. Daemon attachment, previous-tab restoration and marker-file cleanup tests no longer apply to an owned process.                                                                                                                                                                    |
| `test_preview_browser.py`      | Vitest `proof.test.ts`: both metric table shapes; unrelated/misplaced/hidden/missing/incomplete cells; swapped dates; wrong timezone or missing billing-limit caption cannot borrow facts elsewhere; no-op hover, wrong hover values and unchanged keyboard date fail. Real browser matrices call those same proof functions.                                                                                                                                                                              |
| `test_preview_resources.py`    | `resources.spec.ts`: invalid PNG and decoded solid capture fail; a one-pixel change passes with exact dimensions and hash. Vitest `preview-server.test.ts` checks fresh build cleanup, preservation of historical receipts, CSP/file allowlist and occupied-port refusal without replacing the other server. Old marker/symlink/daemon mechanics were removed with the Python owner.                                                                                                                       |

The date inspector and its dedicated browser and component suites were removed. Exact daily values, coverage, exclusions, pricing limits, and unknown-versus-inactive states remain in the screen-reader table and chart tooltip checks. The chart still supports keyboard navigation and pointer tooltips.

## Commands and receipts

```sh
bun run test:browser activity.spec.ts
bun run test:browser calendar.spec.ts --grep '^money'
bun run test:browser mobile-layout.spec.ts
bun run test:browser --grep 'storage combined'
bun run test scripts/browser/proof.test.ts
bun --bun run playwright show-report
```

The full run has 121 browser tests. `test-results/` holds screenshots with original scenario names, decoded PNG dimensions/hashes, per-calendar-case `checks.json` and `result.json` with capture hashes and evidence limits, and activity `early-layout.json`. The HTML report has their attachments. Failures retain traces, screenshots and locator/AX context. A later run clears these output directories; copy them to a separate evidence directory before rerunning if receipts must remain. Historical `/tmp/bbp*-evidence` outputs are not changed.

## Evidence limits

- Trusted Chromium input is not physical-device, native desktop or screen-reader speech proof. Touch is browser emulation; native OS select menus are not tested by `selectOption`.
- AX checks follow only the named table's own descendants, matching all 30 dated rows/cells and its caption. Unrelated text cannot satisfy missing or wrong facts.
- A positive rendered bar must restore the target date after a different keyboard date, then match every exact value. Missing/zero-height bars have no pointer receipt. Tooltips require opaque backgrounds and text contrast at least 4.5:1.
- Browser cancellation fixtures use identical host values and the retained 200ms settle windows. They cannot independently prove rejection of a different wrong-host payload or cancellation of already dispatched work. Existing deterministic public SDK Vitest regressions remain the stronger request-boundary checks.
- This is not installed BB navigation, live capture, identity completeness, complete active collection, source-root mutation, recovery of real data, subscription billing or signed-in account acceptance. No external traffic is authorized.

## Speed and native fixture

`speed.spec.ts` adds eight desktop/375px cases using reports from `createHostHistory.prepare/report`, not hand-written UI speed totals. It checks the three labels and exact accessible counts, both metrics, date navigation, host/all-machine scope, ranking, stable loading-group space, explicit retry and offline display. Screenshots and `backend-reports.json` retain these facts. Native tiers are forward-format policy only; installed-format supported requests are Normal. See [SPEED.md](SPEED.md).
