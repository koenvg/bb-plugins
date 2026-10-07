# BBP-66 activity read measurement

## Source and scope

Pre-implementation baseline: `ad329bec00731709a85fe69312e4fe87a54731b9`.
This local sample used the BBP-66 working-tree diff from that commit, including
untracked tests and documentation. No installed source, bundle, tracker fixture or
browser session changed during that sample. Later integration and activation are
recorded separately below.

## Repository-only fixture

The test reuses BBP-60's `fixture.mjs`, owner `bbp60-activity-read`, in an isolated
SDK test host with in-memory SQLite. It seeds 50 alternating human/agent comments
and ten text attachment metadata records. It does not create real blobs or live
tracker data. Live thread/provider calls use test responses.

- Current feed: one `getTaskActivity` read and zero per-comment attachment reads.
- Previous loader: one `listComments` read and 50 `listAttachments` reads.
- Attachment SQL queries: one current, 50 previous.
- Current response: 22,447 serialized UTF-8 bytes, metadata only.
- Every current entry equals the existing RPCs' comment and attachment output.
- Five real frontend mounts each render 50 comment editors, one composer and ten
  file links through one activity read. They do not make either legacy feed call.

## Local sample

Measured on Node v24.15.0, macOS arm64, Apple M5. Five warm-up API pairs preceded
30 measured pairs. Five frontend mounts ran separately. No timing threshold is
an automated test assertion.

This is the final sample after the notification review fix. The earlier raw sample
remains in the evidence archive. Shared-machine test timings vary; the request and
query counts, entry parity and response size are the stable results.

| Local operation                                         | Samples | Median ms |  p95 ms | Worst ms |
| ------------------------------------------------------- | ------: | --------: | ------: | -------: |
| Activity RPC and schema parse                           |      30 |     0.573 |   1.042 |    1.812 |
| Previous loader and schema parse                        |      30 |     1.644 |   9.525 |   11.101 |
| Current jsdom mount through complete editor/link checks |       5 |   631.251 | 970.507 |  970.507 |

These are repository-only timings, not browser paints. API times omit real network
transport and provider latency. Frontend times include jsdom, React test work and
DOM/assertion query overhead. The five-mount p95 is the maximum sample, not a stable
latency estimate. The test does not compare old/new browser rendering or prove the
100 ms navigation target. Installed-host heavy-feed timing, responsive visual
checks and paired presentation measurements remain unrun and need approved source
activation. Keep those checks separate from the local work-count result.

## Rerun

From `bb-plugin-tasks-plus`, with locked dependencies installed:

```sh
BBP66_ACTIVITY_REPORT=/tmp/bbp66-activity-heavy.json \
  npm test -- scripts/navigation-benchmark/activity-read.test.tsx
```

The optional environment variable writes the raw current sample as JSON. Omit it
for ordinary tests. The test runs without credentials, browser access or a live
tracker. It cleans up mounted UI and the isolated host in `finally`.

For an approved installed-host run, follow the existing bounded protocol in
[paired-baseline-report.md](paired-baseline-report.md). Select the owned heavy task,
record initial heading/description presentation separately, then scroll to the
complete feed. Record its 50 comments, ten download links, one frontend activity
RPC and zero per-comment attachment RPCs. Check real image/download behavior and
an injected metadata failure with Retry activity. Preserve source/bundle identities
and compare the same fixture and viewport; do not reuse the local numbers as host
results or mix heavy-feed work into warm-navigation percentiles.

## Integrated installed checkpoint

The worker checkout later integrated clean main
`b08238d6a8cb0a72308d09f4ff3381b66a6efbfe`, restored the task changes without
conflicts, and passed all 1,070 current Tasks tests, typecheck, build and quality
checks. The approved integrated Tasks bundle `1eec7c306b439dc9` is active.

The owned BENCH-100 page confirms 50 comments, 51 editors and ten file links,
with one activity RPC, no comment-list read and no per-comment attachment reads.
The separate task-owned attachment section still uses one metadata read.
Saved fixture fields, comments and files are unchanged.

Arc kept the owned page hidden and supplied no animation frames despite activation.
DOM and request checks passed, but presentation timing, visual, scrolling and real
download checks remain unrun. The original review finding was fixed; no second
review ran after integration. The earlier local timings above are not measurements
of the integrated installed build. The integrated checkpoint report attached to
BBP-66 records source/bundle identities, browser limits and cleanup. BBP-66 was in
review at that checkpoint.

## Final integrated checks

The final checkout integrates clean main
`47f028b209ab28fbec3153873c91ec742aeb77f6`. All 1,141 Tasks tests, the 19 existing
benchmark tests, typecheck, build and quality checks pass. The active Tasks bundle
is `27bbb47443ec2b3e`; quota remains unchanged at `97416b08f8d08743`.

Five installed heavy-feed loads each confirm one activity read, no per-comment
attachment reads, 50 comments and ten files. Legacy comment output matches exactly.
Browser checks confirm explicit failure, manual retry, labeled retained activity,
a retained notification target, and a real file download with matching bytes.
A held request still allows the heading and description to appear. Browser-only
PNG metadata and pixels also confirm thumbnail and lightbox behavior without
changing stored fixture data. The live fixture has text files only.

The headless feed remains costly, with median/p95 readiness of 6,418.5/7,767.0 ms.
Heading/description readiness has median/p95 6,358.1/7,752.0 ms; two samples were
253.6 and 356.2 ms. These are fresh-page DOM/frame opportunities, not paint traces,
warm navigation percentiles or a speed-up claim. Eager editor work remains in
BBP-67. At 390 pixels the host hides the native Ticket pane, so no phone feed
result is claimed. Full completion evidence attached to BBP-66 records the contract
checks, limits, review disposition and exact source identity.
Earlier checkpoints above are historical. At validation, the active build used
this worktree. Keep it available until an approved source move. Validation finished
before PR publication.
