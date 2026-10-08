# Recorded usage chart

## Use the chart

Select an enrolled host on the Codex Quota page. The allowance summary comes first. The Recharts bar chart shows 30 local calendar dates through today in the viewer's IANA timezone. Previous 30 days and Next 30 days move the range. Next is disabled at the latest range. Previous stops at retained bounds.

Today's values include only recorded events before the report's observation time. Future instants are excluded. Today cannot prove a full-day zero. The chart has no current-day progress banner. Historical date ranges keep their existing coverage rules.

The primary page has two metrics: Tokens and Estimated cost. Changing the metric is local. It does not read history again. Date navigation reads only the bounded retained report. There are no daily-detail, ranking, grouping, entity-inspection or comparison controls on this page. The report uses workspace grouping and host scope.

Tokens includes retained uncertain counts by default as a separate dashed chart segment. There is no uncertainty toggle or combined-total banner. The tooltip and accessible table separate recorded and uncertain counts. Duplicate checks are approximate; missing or unreadable records remain unknown. Estimated cost, recorded totals, rankings, quota and account activity do not include uncertain tokens. This mode is not available for exact-thread reports or comparisons.

The chart reads the index only. To recover earlier omissions, start a new manual import from the configured roots in Historical import. The UI enables uncertain recovery automatically. Resume preserves the frozen import mode. See [Historical import](IMPORT.md) for source limits and duplicate rules.

Hover over a date or use the chart's keyboard navigation to inspect its tooltip. The tooltip shows the date and exact source values, with separate uncertain token estimates when present. It has no lower coverage, pricing or billing-note section. Recorded attribution exclusions appear when nonzero. A screen-reader table has the same daily value, coverage, pricing and exclusion facts, plus timezone and the cost limit in its caption. There are 30 table rows, not 30 native day buttons.

Dates without known values stay missing. They do not become zero-height evidence of inactivity. Only scoped observed inactivity permits zero tokens. With no captured price, cost is unavailable even on an inactive date. Empty unknown history is not zero. Chart coordinates and compact axis labels do not rewrite the exact recorded values.

Empty charts say No recorded history or Observed inactivity. Partial-coverage detail stays in the accessible table, not the tooltip or a chart banner. Loading hides earlier results from another key. A failed refresh can retain an explicitly out-of-date chart only for the same selected host, selection revision, dates and timezone. An observation older than five minutes also shows Chart is out of date. Refresh chart retries that bounded read. Retry chart recovers an unavailable report. Latest 30 days recovers when an older range is outside retained bounds.

Host selection hides earlier values before selection completes. Late responses cannot retarget the chart. Chart navigation and retry do not refresh allowance, request account activity, discover transcripts, start or resume imports, or change collector controls or roots. A successful index read is not proof of complete collection.

## Read captured values correctly

Each accepted record belongs to its original host and full recorded workspace path. Shared workspace usage counts once. Current path metadata is not independently verified by the report. Exact-thread and comparison capabilities remain backend contracts, not primary-page controls. Unknown or ambiguous workspace shares are not allocated to threads.

The recorded token total is authoritative. Reasoning can overlap output, and cache classes are not extra tokens to add. Expired or incomplete class detail is not zero and does not hide retained token or cost subtotals. The primary chart does not expose token-class detail or per-entity averages.

Captured estimated cost uses only finite positive originally captured Pi prices from accepted records. It never consults current model prices. Zero, absent, invalid and negative prices remain unpriced; their tokens still count. No priced records means unavailable money, not free use. Dollar labels identify captured Pi estimates, not billed subscription charges. There is no currency conversion, account allocation or allowance-to-money conversion.

Pricing counts and priced-entity denominators are separate from collection and attribution coverage. Known prices do not prove complete collection. Tiny positive estimates stay positive in decimal or scientific notation rather than rounding to monetary zero. Unsafe monetary sums are unavailable; token facts remain separate.

Records, writer activity, configured roots, settled imports and complete identity do not prove full active collection. Paused capture, omissions, recovery gaps, source uncertainty and unfinished work are not inactivity. Import-only storage can retain readable values without a compatible collector asset, but import coverage remains partial. Durable unfinished or canceled imports and omission receipts still affect their frozen scopes and dates after reopen. Empty imports do not prove zero.

## Open collection settings

Collection management is in the public SDK Usage collection settings section, not below the primary chart. Account activity and extra allowance windows are also in settings. Account activity is independent of selected-host Pi usage.

Collection and history management starts closed. Its panels mount only while open. Opening requests bounded readiness and import status for the selected host. Reopening refreshes both. Closing or unmounting suppresses queued UI requests and late UI results. It cannot undo host work already dispatched. Collector and import commands remain separate from read-only chart navigation.

## Prepare retained history

While the calendar page is visible, a separate `reportPreparation` request loads existing collector logs before retained identity reconciliation. It also continues bounded public identity discovery and evidence delivery. Routine preparation stays silent and does not hide the chart. Stopped preparation retains its recovery control. Each request loads at most 500 source lines and 8 MiB, advances at most four discovery steps, delivers at most 100 identity rows and reconciles at most 200 retained identity rows. Durable source cursors commit with accepted projections. Repeated preparation does not reread unchanged source bodies or count accepted records twice. Ingestion backlog keeps the round pending even when identity is complete. Continuation requests wait 250 ms. Settlement refreshes the chart once.

Collector source discovery checks deterministic owned filenames for 47 recent UTC dates and at most 14 older dates per request. The older-date cursor starts at the collector's first observed date. It advances only after both event and confirmation sources in that slice are absent or fully indexed. It does not read or advance the pruning cursor. Empty slices still advance durable discovery progress, and unchecked older ranges keep preparation pending. A stalled old source leaves its slice pending for retry.

Source settlement covers the recent window, the fixed legacy filenames, and the older ranges checked through the durable cursor. It is not a directory inventory or proof of complete capture. Earlier checked dates are not scanned again after they leave the recent window. Current owned writers append only to today's partition; arbitrary late historical files outside the checked window are not discovered. Concurrent appends can require another round.

The visible graph owns its wall clock and one sequential preparation loop. Activation starts a round; successful settlement schedules the next round 60 seconds later. Missing quota and a slower quota retry schedule do not delay the graph. Hiding the page clears queued timers. Resume recalculates chart age and starts at most one due round, without replaying missed ticks. An interrupted pending round continues through durable cursors after its dispatched request finishes. Closing the page removes its timers and listeners; there is no host or server polling service.

Stopped preparation stays stopped on focus or visibility return. Select Retry preparation to start another bounded round. A recent successful chart read cannot hide the stopped status or certify that new collector data was loaded. Known same-selection values stay visible while preparation is pending or stopped. Current-day values remain partial recorded subtotals, not proof of complete capture.

Host changes, hiding and unmounting cancel queued continuation and ignore late results. Frontend RPC cannot retract work already dispatched. Invalid or unavailable evidence stops automatically. Three consecutive transport failures, three unchanged progress responses after the first response, or 2,048 requests stop the round and show Retry preparation. Unknown ownership remains uncertain after a settled scan; it is not a reason to keep requesting forever. Preparation only loads existing plugin-owned logs into compatible configured storage. It does not change collector controls or assets, scan transcripts, create or migrate storage, perform recovery or ownership backfill, prune logs, change retention, or start imports. Those operations remain in Collection and history management. Dates, metrics and Refresh chart never start preparation.

Quota, its footer, countdown, host selection, refresh and the official usage link remain independent of chart failure. At 375 CSS pixels the primary controls wrap. The browser fixture checks document overflow, settled chart width and trusted Chromium mouse, keyboard and emulated touch input. It does not prove physical-device input or installed BB settings navigation.

The 30-day chart has a collapsed Inspect a date control below it. Open it to select any date with a native button. The picker uses five columns on narrow screens and ten on wider screens, with a minimum button height of 36px. Selected facts use the same date and exact values as the chart tooltip, including nonzero exclusions and separate uncertain token estimates. Coverage and pricing details remain in the accessible table. Unknown history stays unavailable; recorded inactivity stays zero. Date selection is local and makes no report request.

For date-picker target measurements and trusted-input regression checks, run `npm run test:browser -- date-picker.spec.ts` after the setup below. All twelve width/state cases run without a touch-skip option. Chromium emulated touch is not a physical-device check or installed acceptance. See [browser verification](BROWSER-TESTING.md) for the coverage mapping and evidence limits.

## Storage and interfaces

Schema 4 and immutable compact facts are unchanged. Internal `readCalendarTotals` uses indexed storage-side aggregation over accepted records in the bounded UTC interval. Real IANA boundaries assign local dates, including 23-hour and 25-hour dates. Logical cutoffs use the later of the current retention policy and saved monotonic cutoff. Dormant reads cannot expose expired ranges or classes while physical cleanup waits. No individual event array or accepted-record cap crosses the report boundary. The DTO has exactly 30 dates and at most 50 ranked entities; the primary chart does not render the ranking.

`HostHistory` keeps read, control and controlImport. Its optional calendar query/result uses the existing read context and snapshot without refreshing collector readiness. `calendarReport` validates dates, timezone, grouping, scope and echoed query identity. Server routing rechecks selected enrollment and cancellation before dispatch and after return. No-query readiness calls do not aggregate calendar data.

The report opens storage read-only after path, layout, header, version and WAL checks. Canonical control validation rejects unsafe present control and missing established control, but genuine import-only storage needs no collector assets. Unsafe or unsupported storage stays unavailable and untouched. Incomplete ownership backfill blocks report totals. Pending identity discovery or resolution blocks exact-thread totals. Workspace numbers do not repair unknown identity. `readCoverage` and its durable import adapter decide zero and gaps.

Preparation opens that existing index for bounded writes only after the same safety checks. Its connection stays open until asynchronous source reads and projections finish. The history queue remains owned through actual completion, including caller cancellation. Unsafe control or incomplete storage backfill blocks ingestion. Paused collection can drain existing logs without enabling collection or clearing pause coverage; import-only storage skips ingestion without creating a collector control file. Public progress contains a digest of bounded scalar cursors, not log bodies or raw identities.

## Maintained synthetic verification

Run from this package. Browser checks do not need the BB CLI or an installed plugin.

```sh
npm ci
npx playwright install chromium
npm run test:browser
npm test
npm run typecheck
# Diagnostic subset only. Do not report a subset as full acceptance.
npm run test:browser -- calendar.spec.ts --grep 'calendar.*partial'
npm run test:browser -- calendar.spec.ts --grep '^money'
```

The Node preview builds the existing TSX fixtures and scoped Tailwind CSS from this checkout into a fresh temporary directory. Playwright starts its owned loopback server on port 38716, refuses an occupied port, and launches fresh Chromium contexts. It does not reuse a user browser, daemon, server or signed-in profile. It removes only its fresh preview directory on normal shutdown. See [browser verification](BROWSER-TESTING.md) for all old-to-new coverage mappings.

The fixture loads the real plugin app through public SDK `loadPluginApp` and `renderSlot` interfaces. RPCs, hosts and time are synthetic. It includes the real navigation panel, refresh owner and settings section. The synthetic route buttons are fixture controls, not BB product controls. All served resources are local, with a restrictive content security policy. The official link is inspected and focused, never followed.

Playwright owns its browser and contexts and closes them after each test run. No existing tab or login state is used. The preview serves an explicit file allowlist, never the checkout or source roots. Browser routing and server CSP block external traffic. The official link remains local evidence of its target and focusability, not an external navigation test.

The calendar suite covers both metrics at desktop and 375 CSS pixels, exact tooltips and matching facts in the browser accessibility tree, unknown versus inactive dates, retained values with expired classes, large safe values, loading/unavailable/stale states, bounded Previous/Next navigation, retry/latest recovery, pending selection, late canceled-key responses and settings close/reopen behavior. The money suite adds missing prices and tiny positive captured estimates. Metric changes must not send RPCs. Date/retry navigation must send only calendar reads. Management runs only after settings is opened and its disclosure is expanded.

The accessibility check follows the named table's own AX descendants. It matches all 30 dates and their cells in order, checks the column headers, and verifies timezone and the cost limit in that table's caption. Unrelated tooltip text cannot supply missing table facts. For positive bars, the hover check first moves the keyboard tooltip to another date, then requires pointer input to restore the target date and every exact tooltip line. Its pointer receipt is separate from the keyboard receipt. Missing or zero-height bars have no positive-bar pointer receipt.

Recharts schedules hover through an animation frame. Playwright moves the real browser mouse and waits for the exact target date, then checks every definition value. It does not dispatch a DOM mouse event or replace the hover handler. Vitest proof regressions reject a no-op hover, incorrect values and an unchanged keyboard date.

`test-results/` holds named PNGs, decoded image dimensions and SHA-256 JSON, per-case `checks.json` and `result.json`, and date-picker `measurements.json`. `playwright-report/` includes these attachments. Failures retain traces and screenshots. PNG checks decode pixels and reject invalid or solid captures. Recharts can omit numeric tick labels when every daily value is missing or zero; tests still require date ticks and the value-axis label. Positive-value cases require numeric ticks.

Keyboard, mouse and date-picker touch checks use Playwright browser input. Date-picker receipts require `isTrusted` and mouse/touch pointer types. Select controls use `selectOption`; native OS dropdown interaction is not proved. AX facts do not prove screen-reader speech. Separate public SDK React tests cover queued close/unmount cancellation at deterministic request boundaries. Browser close/reopen checks cannot prove that already dispatched host work was canceled.

The browser late-response cases still use identical host values and fixed settle delays. They are weaker than the deterministic public SDK cancellation tests. They do not independently prove rejection of a different wrong-host payload. Keep that browser-evidence limit separate from the stronger SDK tests.

These checks do not certify installed BB navigation, native desktop behavior, real capture, real account attribution, complete active collection or billed use. No live-data permission is part of this task. The held BBP-25 worker's older frontend must not replace the current parent build.

## Historical receipts and separate backend proofs

Do not overwrite historical evidence. Base-calendar receipts belong to BBP-20, `bbthread://thr_kt33mse6a5`, baseline `ceb1ab8087f486a03a5193729232d0ad310436de`. Captured-money and conservative-comparison receipts belong to BBP-21, `bbthread://thr_4xmb2qv79d`, baseline `b9d53677ec1f80da07caa2a96be58e80e09b878c`. Their old frontend matrices describe that earlier UI, not the current chart. The approved installed axes-chart receipts are at `/Users/koen/.bb/thread-storage/thr_2k7buag9sh/ui-axes-8aTS4n/`. This task reads them only.

`npm run test:bundle` is separate backend verification. `check-bundled-calendar.mjs` uses persistent temporary SQLite and owned synthetic files to check full totals beyond top-50 output, reopen, expired classes, cancellation and import-only reporting. `check-bundled-money.mjs` checks original prices, unpriced tokens, denominators, safe sums and conservative comparisons. They are not browser or installed-frontend proof. Node 22 SQLite remains experimental; record exact runtime versions when running these fixtures.

`check-bundled-live-refresh.mjs` uses the built host artifact with temporary collector logs and SQLite. After fixture setup, it calls only preparation and calendar handlers. It checks a multi-batch update, original dates/tokens/captured prices, replay, storage reopen and artifact reload, with network rejected and live paths untouched. Public SDK tests separately check the visible-page schedule with unavailable quota, stopped status, explicit retry, age, visibility return, selection changes and disposal.

Canonical monetary overflow is not established by large safe values or invalid DTO rejection. Generating it under the original record cap needs more than nine million maximum-price records. No hash-pinned old schema-3 artifact is supplied by this guide. Synthetic positive-complete active periods are not acceptance evidence.
