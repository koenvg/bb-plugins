# BBP-20 calendar token report plan

## Baseline and scope

- Baseline: `ceb1ab8087f486a03a5193729232d0ad310436de`, verified before changes.
- Branch: `bb/bbp-20-30-day-calendar-token-reports-thr_kt33mse6a5`.
- Environment: `env_s9rizxwxh4`, isolated worktree.
- Source task: BBP-20. Worker: `bbthread://thr_kt33mse6a5`. Parent: `bbthread://thr_2k7buag9sh`.
- SDK declarations and compatibility check: public SDK 0.5.29. Dependency and lockfile remain unchanged.
- Scope: token reports only. No monetary comparison, quota allocation, import execution, schema change, live source switch or collector action.

## Approved test interfaces

1. Existing `HostHistory.read`, with an optional frozen calendar query in its context and an optional bounded calendar result. Keep the three read/control/import operations.
2. Strict `calendarReport` host and server RPC, tested through the public SDK harness. Recheck selection and cancellation immediately before dispatch and after return.
3. Existing React navigation panel through the public SDK app harness. Test keyboard daily values, range/group/entity changes and old-host invalidation.

Tests use owned synthetic records and persistent temporary SQLite. Fixtures can set up canonical records and typed coverage evidence; assertions use the agreed public interfaces. Do not expose a new per-table test API.

`readCalendarTotals` currently returns up to 10,001 individual records. Replace this internal implementation with indexed storage-side aggregates over every accepted record. Return at most 30 dates and 50 ranking rows. The visible-row limit must not limit summaries or active-entity denominators. Preserve schema 4 and original facts.

## Layout settled before implementation

An owned HTML draft was inspected at 1280px and 375px. It has no page overflow. Screenshots are `/tmp/bbp20-layout-1280.png` and `/tmp/bbp20-layout-375.png`.

- Quota, host selection, refresh and official usage link stay above reports.
- Compact range header, Previous/Next controls, workspace/exact-thread grouping and three token metrics. Controls wrap at 375px.
- Thirty focusable daily marks. Gaps have a distinct pattern and text. Keyboard activation opens exact daily values below the chart.
- Daily detail shows tokens, active entities, the denominator, timezone and coverage. Token classes and exclusions use a disclosure, not hover.
- Ten ranked entities initially. Expand to at most fifty. Labels wrap. Explain that full totals include entities beyond the ranking.
- Entity selection requests the same bounded report with frozen scope. Back returns to all entities.
- Account activity and collection/import management remain separate, collapsed controls.

The default unsigned browser proved the control layout and absence of overflow, but returned empty screenshot files. An isolated Playwright Chromium process produced the screenshots from the same owned local file. It accessed no signed-in session or installed BB surface.

## Calendar and data rules

Use viewer IANA timezone and actual local calendar boundaries. The latest range covers the 30 local dates before today. Previous/Next move by exactly 30 calendar dates. Refuse ranges before the retained cutoff or after the latest range. Freeze timezone, dates, grouping, scope and host selection revision per request.

Use `readCoverage` as the only coverage authority, including its durable import adapter. Event absence is unknown unless that authority proves scoped observed inactivity. Pauses, recovery, omissions, migration or reconciliation work prevent certified zero. Thread grouping uses only uniquely verified bindings; pending identity resolution must not expose stale exact totals.

Keep the source total authoritative. Reasoning can overlap output; cache classes are not additional totals. Expired token classes are unavailable. Captured original cost and missing price remain unchanged and are not shown as subscription spending.

## Validation gate

Run one red/green behavior slice at a time after interface agreement. Cover:

- IANA spring/fall DST, UTC instants near midnight, month/year/leap boundaries.
- Exactly 30 dates, whole-range navigation and retained bounds.
- Reliable zero versus gaps, durable import omissions, paused/recovery/backfill states and expired classes.
- Group/scope/range isolation, more than fifty entities with full aggregate totals, archived/deleted metadata.
- Safe large values, invalid request values, keyboard detail and independent account/import paths.
- Host switch, pre-dispatch cancellation and disposal.

Then run focused/full tests, typecheck, SDK `--check` before builds, all affected retained/new packaged Node 22/24 persistent proofs, desktop/375px browser checks, strict non-interactive OpenSpec and final build. Resolve targeted fixture failures before large retries.

After validation, run exactly one fresh-context read-only completion review against the baseline, including untracked files. Fix blockers and rerun affected checks without a second reviewer. Commit the complete slice with a clean worktree, attach evidence and mark only BBP-20 done. No push, PR or publication.

All installed/live acceptance remains parent-owned and untested by this worker.
