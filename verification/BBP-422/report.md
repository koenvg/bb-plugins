# BBP-422 partial performance result

The goal is a p95 per-interaction worst frame gap of at most 16.7 ms for task switching and status changes through refresh. The reviewed patch improves the fixture but does not meet that target. BBP-422 remains open.

## Change and fixture

`BrowseWorkspace` retains one list shortcut-owner object instead of publishing a new context value on each render. The owner fields and focus rules are unchanged.

The owned fixture uses the production Tasks registrations, home list, Ticket, editor, API and store with a synthetic host and loopback backend. It contains 413 tasks with varied statuses, priorities, dates, labels and approximately 2 KiB descriptions. All rows remain rendered. It has no real agent, PR or provider activity.

The production build uses React 19.3.0, SDK 0.6.157 and local BB build CLI 0.50.1. Measurements use full Chromium 156.0.8078.4 in headless mode at 1920 by 900, UTC, with CPU throttle rate 1.

## Matched fixture results

Five fresh processes per side ran in alternating baseline/candidate order. Each process recorded 120 measured interactions per kind after warmups. Each sample records the largest callback-entry frame gap from input capture through matching UI, required RPC completion, no pending calls and three settled callbacks. Status samples include refresh but exclude opening the menu.

| Pair   | Baseline switch p95 ms | Candidate switch p95 ms | Baseline status p95 ms | Candidate status p95 ms |
| ------ | ---------------------: | ----------------------: | ---------------------: | ----------------------: |
| 1      |                   60.1 |                    35.4 |                   41.8 |                    33.6 |
| 2      |                   46.5 |                    29.8 |                   35.8 |                    27.9 |
| 3      |                   43.6 |                    26.9 |                   33.5 |                    31.5 |
| 4      |                   51.5 |                    19.1 |                   38.1 |                    19.9 |
| 5      |                   44.2 |                    19.4 |                   34.1 |                    20.1 |
| Median |                   46.5 |                    26.9 |                   35.8 |                    27.9 |

All measured samples retain 413 rows. All ten runs report zero timeouts, failed RPC responses, page errors and off-origin requests. Work counts match between sides. Separate diagnostic profiles show React parent-context propagation inclusive sampled time falling from 117.266 to 1.693 ms. Profile runs do not supply the timing percentiles above.

The shared ten-core host was busy. Idle p95 was 17.4 to 18.4 ms, above the target. Later runs were faster, so alternation does not eliminate drift. Status ranges overlap. Do not subtract idle overhead or round a result into acceptance.

## Instrumentation limits

A later diagnostic measured the active frame callback body at 0.300 ms p95 and the extra response-clone/JSON await at 2.700 ms p95. The await includes stream delivery and scheduling, and calls overlap. Its causal effect on frame gaps remains inconclusive. That diagnostic is not a replacement for the matched comparison.

The next measurement step is to isolate transport instrumentation overhead while preserving identity, refresh, error and row-count assertions. Strict acceptance also needs a host with valid idle cadence.

## Verification

- The final `check:review` run passed all nine checks, including 1782 Tasks Plus tests and typecheck.
- Benchmark tests passed 49 cases, including four new failure-path tests. Parent verification reran 18 lifecycle tests successfully.
- Focused keyboard, scroll, optimistic and row checks passed 42 tests. Owned browser fixtures passed 13 status-menu, command and status-transition cases.
- Independent review approved the code after evidence-write and early-child-exit cleanup defects were fixed. Resource closure uses the existing failure-isolated lifecycle.

## Installed BB

Not run. No live plugin installation, activation or owned-record status check occurred. Fixture results do not establish installed acceptance.

## Reproduction and evidence

From the repository root with prepared dependencies and an existing full Chromium executable:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/absolute/path/to/chromium \
  node bb-plugin-tasks-plus/scripts/navigation-benchmark/home-measure.mjs /new/private/output
```

Append `profile` for a separate diagnostic profile. Each run requires a new output directory and owns its browser, server and temporary backend. Use individual cleanup outcomes in the ownership ledgers, not the inherited aggregate `browserClosed` field.

Raw evidence is retained outside Git under the originating thread's storage, `bbp-422`. The matched summary SHA-256 is `3edccc0180e69428431fbe034ef6ad5f1389e80096e37936de8c8f00ab6f1388`. The matched profile-analysis SHA-256 is `89298fa9b1495aa3dadd9f9a4fc33ea341ae95c40dedce8267424ee5b4ead22f`. Lifecycle and overhead evidence has a separately verified 135-entry hash manifest. Source thread: `bbthread://thr_eygcjj7i5r`.
