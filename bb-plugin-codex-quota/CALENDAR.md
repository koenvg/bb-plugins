# Thirty-day recorded token reports

## Use the report

Select an enrolled host on the existing quota page. Recorded tokens shows 30 local calendar dates ending yesterday in the viewer's IANA timezone. Previous 30 days and Next 30 days move the whole report together. Next is disabled at the latest range. Previous stops before the retained compact cutoff. Latest 30 days returns to the current range.

Workspaces is the default. Each record belongs to its original host and full recorded workspace path. Shared workspace usage counts once. Current path metadata is not independently verified by the report. Exact threads includes only uniquely verified bindings. Unknown or ambiguous workspace shares are not allocated to threads. These groupings are alternative views, not additional usage to add together.

Choose Recorded tokens, Active entities or Tokens per active entity. Active entities means distinct workspaces or verified threads with accepted recorded usage, including accepted zero-token records. It does not mean completed work. The daily denominator covers one local date. The range denominator counts each entity once across all 30 dates, including entities beyond visible ranking rows. With no active entity, the average is unavailable rather than zero.

The ranking starts with ten rows and expands to at most fifty. Its truncation does not reduce report totals or denominators. Inspect a ranked row to restrict the same report to that entity. All entities removes that restriction. Available and archived verified threads have a public BB navigation button. Deleted or missing metadata retains recorded totals and a stable ID, without a guessed link.

Tab to any of the thirty date marks and press Enter or Space. Daily detail shows the exact source total, active entities, the ratio, timezone and coverage. Open Token classes and exclusions by keyboard for class values and evidence counts. Hover is not required.

## Read the limits

The recorded source total is authoritative. Reasoning can overlap output, and cache classes are not extra tokens to add. When any accepted record on a date lacks retained detail, its full class breakdown is unavailable. Expired classes are not zero. Captured original costs and missing prices remain in storage unchanged; this token report does not display prices, estimates, comparisons or subscription spending.

Solid chart marks are recorded subtotals. A zero is permitted only when the scoped coverage authority proves observed inactivity. Dashed marks are gaps. A zero-token record can establish an active entity without certifying zero token activity across its whole date. Unknown dates, paused capture, omissions, recovery gaps, source uncertainty and unfinished work are not inactivity.

Import-only databases can return retained tokens even without a compatible collector asset. Import coverage remains partial and cannot confirm live capture. Durable unfinished or canceled imports and omission receipts continue to affect their frozen scopes and dates after reopen. Empty imports do not prove zero.

Loading hides earlier results from a different key. Partial, unknown, observed inactivity, stale and unavailable have separate text. A failed refresh can keep an explicitly stale snapshot only for the same host, selection revision, dates, timezone, grouping and entity scope. Host selection invalidates old values immediately, even before the selection request finishes. Late responses cannot retarget the report.

A report observation older than five minutes is labeled stale using the existing app clock. It has no separate polling timer. Refresh report reads the selected host's retained index only. It does not refresh quota or account activity, discover/read transcripts, start/resume imports, or change collector controls or roots. Check readiness in Collection and history management continues the existing bounded ingestion and maintenance separately. A successful index read is not proof of complete collection.

Quota, its footer, countdown, host selection, refresh and the official usage link remain independent of report failures. Account details and collection/import management stay in separate collapsed disclosures. At 375px the controls and workspace labels wrap without page overflow.

## Storage and interfaces

Schema 4 and immutable compact facts are unchanged. The internal `readCalendarTotals` uses indexed storage-side aggregation over every accepted record in the bounded UTC interval. Original UTC instants are assigned with real IANA calendar boundaries, including 23-hour and 25-hour dates. Logical cutoffs are the later of the current retention policy and the saved monotonic cutoff. Dormant reads cannot expose expired ranges or class detail while physical cleanup waits. No individual event array or accepted-record cap crosses the report boundary. The output has exactly 30 dates and at most 50 ranked entities. Coverage reads retain their existing evidence limits and disclose truncation.

`HostHistory` keeps read, control and controlImport. An optional typed calendar query/result uses its existing read context/snapshot; collector readiness is not refreshed by that path. `calendarReport` is a strict thin host/server RPC adapter. It validates dates, timezone, grouping, scope and echoed response dates. Server routing rechecks selected enrollment and cancellation immediately before dispatch and after return. No-query readiness calls do not aggregate calendar data.

The report opens storage read-only after the existing path, layout, header, version and WAL checks. Shared canonical control validation rejects malformed or unsafe present control and missing established control, without requiring assets or control in genuine import-only storage. Unsafe or unsupported storage stays unavailable and untouched. Incomplete canonical ownership backfill blocks report totals. Pending identity discovery or resolution blocks exact-thread totals. Workspace numbers do not repair unknown identity. The single `readCoverage` authority and its durable import adapter decide zero and gaps.

## Synthetic verification

The public HostHistory/RPC/React test interfaces were approved by the parent before tests. The red/green checkpoints and final receipts belong to BBP-20, `bbthread://thr_kt33mse6a5`, against baseline `ceb1ab8087f486a03a5193729232d0ad310436de`.

Run from this package:

```sh
npm test -- calendar-host.test.ts calendar-routing.test.ts calendar-app.test.tsx
npm test
npm run typecheck
bb plugin types --check
npm run test:bundle
```

The new packaged `scripts/check-bundled-calendar.mjs` copies the self-contained host artifact away from dependencies. It uses real persistent temporary SQLite and owned source/agent files. It verifies 12,060 accepted records across 60 workspaces, top-50 output with full totals, reopen, expired classes, unchanged original price/schema/control, cancellation and import-only reporting. Run it and the retained bundle fixtures on Node 22 and Node 24. Node 22 SQLite remains experimental.

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

These checks do not certify installed BB navigation, real capture, real account attribution or billed use. This worker changed no installed source, collector, host/account/Pi settings or real roots. Installed acceptance remains parent-owned. No push, publication or live data cleanup is part of BBP-20.
