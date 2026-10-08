# Synthetic browser verification

Run from `bb-plugin-codex-quota/` with Node 24.15 and npm:

```sh
npm ci
npx playwright install chromium
npm run test:browser
npm test
npm run typecheck
```

`@playwright/test` is locked to 1.64.0. `npm test` remains Vitest. Its default exclusions are retained, with only `scripts/browser/**/*.spec.ts` added. `proof.test.ts` remains in Vitest.

No Python, Pillow, Browser Use, Bun, BB CLI or prebuilt `dist/` is required for browser checks. Existing `.mjs` bundle checks and `npm run test:bundle` are unchanged and remain separate backend verification.

## Ownership and local resources

Playwright launches its own Chromium, creates fresh test contexts, and closes them. No existing browser profile, login, tab or daemon is used. The Node preview builds the existing TSX/HTML fixtures and scoped Tailwind utilities into a fresh `codex-quota-preview-*` directory under the OS temporary directory. Playwright sends SIGTERM and waits up to five seconds for server cleanup. The server removes that directory on normal shutdown. It never builds into `dist/` or writes product/source-root data.

The preview listens only on `127.0.0.1:38716`. An occupied port fails; an existing server is never reused or replaced. It serves only the five fixture HTML/JavaScript pairs and generated CSS, not the checkout. The server CSP blocks external connections. Each test context also blocks and fails any non-local browser request. The official usage link is inspected and focused, never followed.

The CSS compiler uses the BB Tailwind 4.3 theme/utility layer pattern without preflight, fixture theme aliases and the existing HTML dark theme. This is synthetic fixture CSS, not acceptance of BB's packaged CSS build or installed theme. The public SDK calendar renderer needs React's development build for `act`. All hosts, RPCs, clocks and datasets are synthetic.

## Coverage mapping

Every matrix keeps both 1280px desktop and 375px narrow checks. State filters are diagnostic only.

`tooltip-input.spec.ts` adds a metric-switch regression with deferred browser frames. The driver clears pointer selection in the chart margin and waits for rendered input frames before reading keyboard results. The regression keeps real input handlers, checks that queued pointer work finishes before keyboard input, and still requires hover to restore the target date with exact facts.

| Removed runner                 | Maintained suite and retained checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check-activity-preview.py`    | `activity.spec.ts`: early collapsed/open desktop and narrow screenshots, one disclosure read, Enter/Space, keyboard table scroll, local weekly switch, stop-read window, no overflow, focusable official link and layout JSON.                                                                                                                                                                                                                                                                             |
| `check-calendar-preview.py`    | `calendar.spec.ts`, `calendar` cases: 13 states at both widths and both metrics. States are partial, unknown, inactive, expired, huge, stale, unavailable, loading, retry, latest, selection, cancel and settings. Exact values/coverage/exclusions, no metric RPC, date and numeric axes, settled width, spacing/containment, opaque AA-contrast tooltip, independent hover, complete AX facts, bounded navigation, retry/latest recovery, pending selection, late responses and management close/reopen. |
| `check-money-preview.py`       | `calendar.spec.ts`, `money` cases: 10 states at both widths and both metrics. States are partial, no-prices, tiny, huge, expired, unknown, inactive, stale, unavailable and loading. Exact captured dollars, smallest positive estimate, missing prices and inactive cost stay distinct; same layout, AX, keyboard/hover and no-RPC requirements.                                                                                                                                                          |
| `check-date-picker-preview.py` | `date-picker.spec.ts`: six states at both widths. Partial, unknown, inactive, no-prices, tiny and huge. Thirty exact dates, pressed selection and exact detail values, minimum 24x24 CSS-pixel date/disclosure targets, mouse at date 14, Tab/Enter/Space, touch at dates 29 and 14, trusted input receipts, exactly one report read, screenshots and measurements. No touch skip.                                                                                                                         |
| `check-collector-preview.py`   | `management.spec.ts`, `collector`: collapsed/open desktop and narrow screenshots, explicit install, partial workspace totals, pause/resume/repair, action counts, readiness without action, keyboard close, retained official link and no overflow.                                                                                                                                                                                                                                                        |
| `check-identity-preview.py`    | `management.spec.ts`, `identity`: complete/partial states at both widths, Enter exact-thread and Space archived callbacks, missing/deleted non-links, removal of old exact rows during partial discovery, retained workspace totals and link.                                                                                                                                                                                                                                                              |
| `check-import-preview.py`      | `management.spec.ts`, `import`: stopped/frozen scope at both widths, trusted keyboard Resume, disabled Start/source root, readable wrapping and link focus.                                                                                                                                                                                                                                                                                                                                                |
| `check-retention-preview.py`   | `management.spec.ts`, `retention`: 22 cases. Five health states plus six legacy phases at both widths. Health initially collapsed, expired classes unavailable, recovery gap, pause/resume, readiness action counts, quota/link, explicit stopped-writer checkbox consent and blocked warning.                                                                                                                                                                                                             |
| `check-storage-preview.py`     | `management.spec.ts`, `storage combined`: 28 cases. Five health states, six legacy phases and configured/completed/canceled import at both widths. Frozen source/save controls, Resume/Cancel reachability, synthetic thread callback, quota/link and no overflow.                                                                                                                                                                                                                                         |
| `preview_browser.py`           | `calendar-driver.ts`, `chart-layout.ts` and `proof.ts`: exact daily DOM/AX facts, independent keyboard/real hover receipts, layout/contrast, selection/recovery/settings interactions and call limits. Shared `fixtures.ts` owns external-traffic and browser-error assertions and screenshot receipts.                                                                                                                                                                                                    |
| `preview_resources.py`         | `playwright.config.ts` and `preview-server.mjs`: fresh browser/context and temporary build ownership, local server/CSP, no reuse; `fixtures.ts` fully decodes PNGs, rejects solid pixels and records dimensions/SHA-256. Daemon attachment, previous-tab restoration and marker-file cleanup tests no longer apply to an owned process.                                                                                                                                                                    |
| `test_preview_browser.py`      | Vitest `proof.test.ts`: both metric table shapes; unrelated/misplaced/hidden/missing/incomplete cells; swapped dates; wrong timezone or missing billing-limit caption cannot borrow facts elsewhere; no-op hover, wrong hover values and unchanged keyboard date fail. Real browser matrices call those same proof functions.                                                                                                                                                                              |
| `test_preview_resources.py`    | `resources.spec.ts`: invalid PNG and decoded solid capture fail; a one-pixel change passes with exact dimensions and hash. Vitest `preview-server.test.ts` checks fresh build cleanup, preservation of historical receipts, CSP/file allowlist and occupied-port refusal without replacing the other server. Old marker/symlink/daemon mechanics were removed with the Python owner.                                                                                                                       |

The old date-picker Python coverage assertion was stale. The baseline `src/history/calendar/calendar-date-picker.test.tsx` requires selected detail to omit coverage, with coverage in the corresponding dated table row. The migration retains exact detail values, adds the same absence assertion, and moves coverage checks to that exact row. The supervisor approved this relocation; no product behavior changed. Its old `body.dataset.reportCalls` marker also no longer exists in the reused SDK fixture. The replacement checks the actual `calendarFixture.calls` list for exactly one `calendarReport`, rather than recreating a mirror counter.

## Commands and receipts

```sh
npm run test:browser -- activity.spec.ts
npm run test:browser -- calendar.spec.ts --grep '^money'
npm run test:browser -- date-picker.spec.ts
npm run test:browser -- --grep 'storage combined'
npm test -- scripts/browser/proof.test.ts
npx playwright show-report
```

The full run has 116 browser tests. `test-results/` holds screenshots with original scenario names, decoded PNG dimensions/hashes, per-calendar-case `checks.json` and `result.json` with capture hashes and evidence limits, date-picker `measurements.json` and activity `early-layout.json`. The HTML report has their attachments. Failures retain traces, screenshots and locator/AX context. A later run clears these output directories; copy them to a separate evidence directory before rerunning if receipts must remain. Historical `/tmp/bbp*-evidence` outputs are not changed.

## Evidence limits

- Trusted Chromium input is not physical-device, native desktop or screen-reader speech proof. Touch is browser emulation; native OS select menus are not tested by `selectOption`.
- AX checks follow only the named table's own descendants, matching all 30 dated rows/cells and its caption. Unrelated text cannot satisfy missing or wrong facts.
- A positive rendered bar must restore the target date after a different keyboard date, then match every exact value. Missing/zero-height bars have no pointer receipt. Tooltips require opaque backgrounds and text contrast at least 4.5:1.
- Browser cancellation fixtures use identical host values and the retained 200ms settle windows. They cannot independently prove rejection of a different wrong-host payload or cancellation of already dispatched work. Existing deterministic public SDK Vitest regressions remain the stronger request-boundary checks.
- This is not installed BB navigation, live capture, identity completeness, complete active collection, source-root mutation, recovery of real data, subscription billing or signed-in account acceptance. No external traffic is authorized.
