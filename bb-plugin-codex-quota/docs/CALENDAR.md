# Thirty-day recorded usage reports

## Use the report

Select an enrolled host on the existing quota page. Recorded usage shows 30 local calendar dates ending yesterday in the viewer's IANA timezone. Previous 30 days and Next 30 days move the whole report together. Next is disabled at the latest range. Previous stops before the retained compact cutoff. Latest 30 days returns to the current range.

Workspaces is the default. Each record belongs to its original host and full recorded workspace path. Shared workspace usage counts once. Current path metadata is not independently verified by the report. Exact threads includes only uniquely verified bindings. Unknown or ambiguous workspace shares are not allocated to threads. These groupings are alternative views, not additional usage to add together.

Choose Recorded tokens, Active entities, Tokens per active entity, Captured estimated cost or Estimate per priced active entity. Active entities means distinct workspaces or verified threads with accepted recorded usage, including accepted zero-token records. It does not mean completed work. The daily denominator covers one local date. The range denominator counts each entity once across all 30 dates, including entities beyond visible ranking rows. With no active entity, the average is unavailable rather than zero.

Captured estimated cost uses only finite positive originally captured Pi prices from accepted records. It never consults current model prices. Zero, absent, invalid and negative prices remain unpriced; their tokens still count. No priced records means unavailable money, including an observed inactive date. It does not mean free use. Dollar labels mean captured Pi estimates, not billed subscription charges. There is no currency inference/conversion, account allocation or conversion from allowance to money.

The pricing counts and distinct priced-entity denominator are separate from collection and attribution coverage. A day with workspace estimates 4 and 6 plus one unpriced workspace has known cost 10, priced average 10 / 2 = 5, and three token-active workspaces. Pricing is partial. Range denominators include all accepted eligible records beyond the fifty-row ranking, with each priced entity counted once across all dates. Summary, keyboard day values/detail and token-ranked rows show priced-record counts and priced-entity denominators. An available pricing subtotal cannot prove complete collection.

Tiny positive estimates remain positive in decimal or scientific notation, not a rounded monetary zero. A monetary sum outside the safe finite range is unavailable with an explicit reason; tokens remain separate. A ratio below the numeric range is unavailable and keeps its original subtotal and denominator visible.

The ranking starts with ten rows and expands to at most fifty. Its truncation does not reduce report totals or denominators. Inspect a ranked row to restrict the same report to that entity. All entities removes that restriction. Available and archived verified threads have a public BB navigation button. Deleted or missing metadata retains recorded totals and a stable ID, without a guessed link.

Tab to any of the thirty date marks and press Enter or Space. Daily detail shows the exact source total, active entities, the ratio, timezone and coverage. Open Token classes and exclusions by keyboard for class values and evidence counts. Hover is not required.

## Previous thirty-date subtotals

Compare defaults to Off. Choose Previous 30 dates to add the immediately preceding thirty local dates for the same selected host, timezone, group and entity scope. Both periods share one frozen observation clock, effective retention boundary and read-only SQLite snapshot. There is no new history operation. Metric changes remain local; the comparison toggle and other navigation request only the bounded calendar report.

The current/prior cards show accepted recorded-token and captured-money subtotals, token and priced-entity denominators, and separate collection, attribution and pricing limits. No eligible price means unavailable money even for inactive dates. Unknown empty token history is not zero. An expired or unreadable prior range does not hide readable current values. Expired class detail does not hide retained token or price subtotals.

Active-period percentages are unavailable under the current evidence contract. This is an operator-approved capability limit, not an implemented positive complete-active percentage path. Only genuine scoped observed inactivity from `readCoverage.zero` certifies complete token/entity dates. Records, writer activity, configured roots, settled ingestion/import and complete identity do not prove full active collection. Known prices do not prove it either. Attribution exclusions, missing collection evidence, unsafe/unavailable prior data and stale results have fixed explanations. Inactivity can show zero tokens/entities, but a zero prior baseline never produces a percentage. Ratios need their actual nonzero entity denominator. Unknown money does not change the separate zero-baseline token explanation.

A failed same-key refresh retains explicitly stale current/prior subtotals only. Changing comparison mode, scope or host hides the earlier key at once. The response must echo both complete query identities and the same observation time. Incompatible or contradictory prior responses are rejected; no inferred period or scope is used.

## Read the limits

The recorded source total is authoritative. Reasoning can overlap output, and cache classes are not extra tokens to add. When any accepted record on a date lacks retained detail, its full class breakdown is unavailable. Expired classes are not zero. Compact original costs and missing prices remain in storage unchanged. Expired token classes do not hide retained tokens or captured estimates and never cause repricing.

Solid chart marks are recorded subtotals. A zero is permitted only when the scoped coverage authority proves observed inactivity. Dashed marks are gaps. A zero-token record can establish an active entity without certifying zero token activity across its whole date. Unknown dates, paused capture, omissions, recovery gaps, source uncertainty and unfinished work are not inactivity.

Import-only databases can return retained tokens even without a compatible collector asset. Import coverage remains partial and cannot confirm live capture. Durable unfinished or canceled imports and omission receipts continue to affect their frozen scopes and dates after reopen. Empty imports do not prove zero.

Loading hides earlier results from a different key. Partial, unknown, observed inactivity, stale and unavailable have separate text. A failed refresh can keep an explicitly stale snapshot only for the same host, selection revision, dates, timezone, grouping, entity scope and comparison mode. Host selection invalidates old values immediately, even before the selection request finishes. Late responses cannot retarget the report.

A report observation older than five minutes is labeled stale using the existing app clock. Refresh chart reads only the retained index. It does not refresh quota or account activity, read transcripts, start/resume imports, or change collector controls or roots. A successful index read is not proof of complete collection.

While the calendar page is visible, a separate explicit `reportPreparation` request continues bounded public identity discovery, evidence delivery and retained identity reconciliation. "Preparing history" stays visible without hiding the chart. Each request advances at most four discovery steps, delivers at most 100 identity rows and reconciles at most 200 retained identity rows. Continuation requests wait 250 ms and do not restart the catalog on clock expiry. Settlement refreshes the chart once. The existing app clock starts another preparation round after 60 seconds.

Host changes, hiding and unmounting cancel queued continuation and ignore late results. Frontend RPC cannot retract work already dispatched. Invalid or unavailable evidence stops automatically. Three consecutive transport failures, three unchanged progress responses after the first response, or 2,048 requests stop the round and show Retry preparation. Unknown ownership remains uncertain after a settled scan; it is not a reason to keep requesting forever. Ownership backfill, collector ingestion, retention, imports and collector controls remain in Collection and history management. Preparation does not perform those operations. Dates, metrics and Refresh chart never start preparation.

Quota, its footer, countdown, host selection, refresh and the official usage link remain independent of report failures. Account details and collection/import management stay in separate collapsed disclosures. At 375px the controls and workspace labels wrap without page overflow.

## Storage and interfaces

Schema 4 and immutable compact facts are unchanged. The internal `readCalendarTotals` uses indexed storage-side aggregation over every accepted record in the bounded UTC interval. Original UTC instants are assigned with real IANA calendar boundaries, including 23-hour and 25-hour dates. Logical cutoffs are the later of the current retention policy and the saved monotonic cutoff. Dormant reads cannot expose expired ranges or class detail while physical cleanup waits. No individual event array or accepted-record cap crosses the report boundary. The output has exactly 30 dates and at most 50 ranked entities. Coverage reads retain their existing evidence limits and disclose truncation.

`HostHistory` keeps read, control and controlImport. An optional typed calendar query/result uses its existing read context/snapshot; collector readiness is not refreshed by that path. `calendarReport` is a strict thin host/server RPC adapter. It validates dates, timezone, grouping, scope and echoed response dates. Server routing rechecks selected enrollment and cancellation immediately before dispatch and after return. No-query readiness calls do not aggregate calendar data.

The report opens storage read-only after the existing path, layout, header, version and WAL checks. Shared canonical control validation rejects malformed or unsafe present control and missing established control, without requiring assets or control in genuine import-only storage. Unsafe or unsupported storage stays unavailable and untouched. Incomplete canonical ownership backfill blocks report totals. Pending identity discovery or resolution blocks exact-thread totals. Workspace numbers do not repair unknown identity. The single `readCoverage` authority and its durable import adapter decide zero and gaps.

## Synthetic verification

The public HostHistory/RPC/React test interfaces were approved before tests. Base-calendar receipts belong to BBP-20, `bbthread://thr_kt33mse6a5`, against baseline `ceb1ab8087f486a03a5193729232d0ad310436de`. Captured-money and conservative-comparison receipts belong to BBP-21, `bbthread://thr_4xmb2qv79d`, against baseline `b9d53677ec1f80da07caa2a96be58e80e09b878c`. Synthetic positive-complete active periods are not used as evidence.

Run from this package:

```sh
npm test -- src/history/calendar/calendar-host.test.ts src/history/calendar/calendar-money-host.test.ts src/history/calendar/calendar-routing.test.ts src/history/calendar/calendar-app.test.tsx
npm test
npm run typecheck
bb plugin types --check
npm run test:bundle
```

The new packaged `scripts/check-bundled-calendar.mjs` copies the self-contained host artifact away from dependencies. It uses real persistent temporary SQLite and owned source/agent files. It verifies 12,060 accepted records across 60 workspaces, top-50 output with full totals, reopen, expired classes, unchanged original price/schema/control, cancellation and import-only reporting. Run it and the retained bundle fixtures on Node 22 and Node 24. Node 22 SQLite remains experimental.

`scripts/check-bundled-money.mjs` also proves original prices and unpriced tokens, full priced denominators, tiny/large safe retained sums and read-only conservative comparisons. Actual canonical money aggregate overflow has not been generated: with the original per-record cap it needs more than nine million maximum-price records. Large safe sums, malformed-value DTO rejection, UI unavailable states and source inspection are not that proof. No hash-pinned old schema-3 artifact was supplied or run by the BBP-21 worker.

For the owned React browser preview:

```sh
mkdir -p /tmp/bbp20-preview
bun build scripts/calendar-preview.tsx --target browser --outfile /tmp/bbp20-preview/activity-preview.js
cp dist/app.css /tmp/bbp20-preview/app.css
cp scripts/activity-preview.html /tmp/bbp20-preview/index.html
python3 -m http.server 38720 --bind 127.0.0.1 --directory /tmp/bbp20-preview
# In a second terminal:
uv run --with playwright python scripts/check-calendar-preview.py
```

The browser checks block non-local traffic and cover desktop and 375px keyboard interaction, daily values/classes/denominators, gaps, reliable zero, stale/loading/unavailable states, huge safe values, bounded expansion, date/group/entity requests and thread metadata. Screenshots go to `/tmp/bbp20-evidence`.

For the BBP-21 money/comparison matrix, build the same preview in `/tmp/bbp21-react-preview`, serve only localhost port 38721, then run `scripts/check-money-preview.py`:

```sh
mkdir -p /tmp/bbp21-react-preview
bun build scripts/calendar-preview.tsx --target browser --outfile /tmp/bbp21-react-preview/activity-preview.js
cp dist/app.css /tmp/bbp21-react-preview/app.css
cp scripts/activity-preview.html /tmp/bbp21-react-preview/index.html
python3 -m http.server 38721 --bind 127.0.0.1 --directory /tmp/bbp21-react-preview
# In a second terminal:
uv run --with playwright python scripts/check-money-preview.py
```

This matrix also checks local money metrics, missing prices, tiny/huge values, prior subtotals, zero-baseline/denominator reasons, expired/incompatible/stale prior data, keyboard comparison controls and quota/link reachability. Screenshots go to `/tmp/bbp21-evidence`. Bun builds only the synthetic frontend preview; packaged runtime proofs use the exact Node 22/24 binaries.

These checks do not certify installed BB navigation, real capture, real account attribution or billed use. This worker changed no installed source, collector, host/account/Pi settings or real roots. Installed acceptance remains parent-owned. No push, publication or live data cleanup is part of BBP-20.
