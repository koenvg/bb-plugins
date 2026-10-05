# Native Ticket baseline

Current completed paired baseline: [paired-baseline-report.md](paired-baseline-report.md). The earlier manual checkpoint remains in [baseline-report.md](baseline-report.md). No optimization has run. The benchmark is outside the app bundle and does not change application selection, saves, drafts, keyboard guards or Ticket lifetime. The new report records the existing BBP-50 compact draft-loss defect and BBP-104 lint gap.

## Original source gate

See `source-identity.json` for captured source and bundle identities. Native Ticket commit `78fdd0857c79cc6ed10ea2c3a31bf94e9ba58664` is already an ancestor of implementation base `43c2804c53cc07f1e7959c9b2bc93000e1c670ce`. No prerequisite merge was needed.

The original installed checkout was clean at `6c6bd792926de897215898e01b1e09c14ddba252`. Its native workspace, Ticket portal, keyboard, edit session, save session and native-pane test match this branch byte for byte. All 243 tracked Tasks files and 37 quota files were compared read-only. Twenty Tasks files differ because this branch includes the upstream list-declutter change `cdc3ac2`. Quota source is identical. Do not compare an installed-old-list run to a candidate-new-list run as an optimization result.

The served Tasks app matches the installed disk app by SHA-256. The served quota app also matches disk. These facts establish source provenance, not that a browser currently runs these bundles. Verify actual browser resource URLs again after approved activation. Preserve the raw original identity artifact; write later identities beside each run, not over this file.

## Repository-only rerun and cleanup

Run from the repository root with Node 24. These commands do not contact the tracker or open a browser.

```sh
node --test bb-plugin-tasks-plus/scripts/navigation-benchmark/benchmark.test.mjs bb-plugin-tasks-plus/scripts/navigation-benchmark/qualification.test.mjs
node bb-plugin-tasks-plus/scripts/navigation-benchmark/cli.mjs fixture /tmp/bbp60-owned-fixture bbp60-native-baseline
node bb-plugin-tasks-plus/scripts/navigation-benchmark/cli.mjs cleanup /tmp/bbp60-owned-fixture bbp60-native-baseline
```

Fixture creation refuses existing directories. Cleanup requires the matching owner, original fixture hash and exactly the two owned regular files. It refuses foreign or modified content. Preserve a copy of `fixture.json` and its ownership record in the evidence archive before cleanup. No generic tracker-delete or browser-close command is provided.

The fixture contains 100 tasks, labels, dates, ten approximately 2 KiB descriptions, a 36-movement up/down sequence, and a separate task with 50 alternating human/agent comments and ten text attachments. It is an offline fixture manifest, not an import into live storage. Provisioning into a native tracker needs a separately approved adapter or manual setup. Record actual project/task/comment/attachment IDs in an ownership manifest. The ten navigation task keys must match `warmKeys` and form a consecutive visible window. Do not use a full-tracker prefetch.

## Approved browser run

For current paired evidence, use the bounded protocol in `paired-baseline-report.md`. The generic runner below has mock-driver coverage, but its full live run timed out. It does not install the new pre-load qualification observer. Do not treat its previsited classification as the qualified paired baseline.

Do not execute this section without operator approval. `approvalReference` is an audit field, not an authorization mechanism. The worker cannot create its own approval.

Use an operator-provided Playwright-compatible `page` in a dedicated local Chromium session on the BB host. Do not take over an existing personal or BB desktop session. The runner does not connect to, acquire, navigate or close sessions. Browser provisioning, authentication and fixture provisioning remain approval gates. No Playwright dependency was added to either plugin.

Open only the owned fixture project and select a list order where the ten keys are consecutive. Close overlays and leave all fixture edits saved. Confirm Tasks and quota are enabled, and record the running bundle resource URLs, host, browser version, fixture SHA-256 and source commits. Keep a separate ownership record for the browser context.

From an approved host-side driver that already owns `page`:

```js
import { readFile, writeFile } from "node:fs/promises";
import { runNavigation } from "./bb-plugin-tasks-plus/scripts/navigation-benchmark/runner.mjs";
const fixture = JSON.parse(await readFile("/tmp/bbp60-owned-fixture/fixture.json", "utf8"));
const identities = JSON.parse(await readFile("/tmp/bbp60-current-run-identities.json", "utf8"));
// identities.tasks and identities.quota each need sourceCommit, bundle and enabled: true.
const raw = await runNavigation(page, {
  fixture,
  identities,
  mode: "latency",
  approvalReference: "THE ACTUAL OPERATOR APPROVAL MESSAGE OR RECORD",
});
await writeFile("/tmp/bbp60-latency.json", JSON.stringify(raw, null, 2), { flag: "wx" });
```

```sh
node bb-plugin-tasks-plus/scripts/navigation-benchmark/cli.mjs report /tmp/bbp60-latency.json > /tmp/bbp60-latency-summary.json
```

The driver sets 1440x900 and CPU throttling rate 1. It visits all ten tasks and returns to the first, keeps those 18 warm-up samples separate, then records 36 warm movements. Each recorded movement requires the expected selected row, native detail key, exact title, description heading marker, rendered paragraphs, list and link. Timing starts at captured keydown. It ends on the second animation-frame callback after matching content becomes available, with identity checked again. This gives a presentation opportunity, not proof of a physical display paint. Check User Timing marks against a separate timeline trace. A failed warm sample blocks the summary; raw failures remain in the run. There is no automatic claim of a speed-up or task completion.

Warm labels in the main driver mean previously visited, clean fixture tasks. Before running, verify no save or invalidation is pending. The runner cannot prove this from DOM alone. Do not use it for edited tasks. For separate cold, save-pending and failed cases, use `createProbe().arm()` with the explicit classification and fixture identity. Failed saves may correctly keep the old row; their timeout is failure evidence, not a warm sample. The runner retains any failed navigation as an error and stops instead of silently skipping it.

## Separate profiling and secondary cases

Run `runNavigation` again with `mode: 'profile'` in the same approved dataset, never in the final latency run. Start CPU sampling and a CDP timeline trace in the owning driver before that call. Save the CPU profile and trace to new files. The probe adds `bbp60-N-start` and `bbp60-N-end` User Timing marks. Profile mode counts date calls and time, then restores the original formatter on disposal. Do not leave a profile probe running during final latency measurements.

Record rendering, style and layout trace totals without adding nested durations as independent costs. The probe exports supported long-task and resource entries. The driver counts plugin HTTP requests by path and method when discoverable. Batched/unresolved RPC calls and date work outside the wrapped formatter require trace/transport inspection. Missing browser support stays `null`, not zero. Per-sample attribution uses entry `startTime` and sample start/end marks; report run totals separately from per-movement counts.

Measure the 50-comment task separately. Record initial description presentation, then scroll to activity and record the complete feed/editor count and attachment requests. Do not mix that work into warm navigation percentiles. Also report cold load, rapid repeats, long descriptions, compact native drawer, failed reads, failed saves, task-owned comment drafts and Ticket close/park/reopen separately. Later cache invalidation/eviction cases belong to the optimization slices, not this baseline implementation.

## Approval request and rollback

Ask parent `thr_w7j752igff` to obtain approval for this exact live checkpoint:

1. Move only installed `tasks-plus` from `path:/Users/koen/workspace/bb-plugins/bb-plugin-tasks-plus` to this shared environment's `bb-plugin-tasks-plus` source. Candidate app SHA-256 is in `source-identity.json`. This includes the already-integrated upstream list-declutter delta; it adds no BBP-61 through BBP-67 optimization. Leave quota source, enabled states, existing fixture plugins and settings unchanged. Record the newly activated bundle identity before measuring. Do not replace or restart anything until approval is explicit.
2. Approve a separate owned benchmark project containing exactly the manifest's 100 tasks, labels, 50 comments and ten text files. No existing user task can be edited. Decide the isolated tracker and identity mapping before provisioning. Do not seed live data on this worker's authority.
3. Approve a new dedicated browser session and page-only measurement instrumentation, including the temporary formatter wrapper only during profiling. Do not acquire an existing user session.

These are proposed actions, not executed commands. After approval, the source move uses `bb plugin install path:/Users/koen/.bb/plugins/environment-git-worktree/host-data/worktrees/thr_w7j752igff-1/bb-plugins/bb-plugin-tasks-plus`. Rollback uses `bb plugin install path:/Users/koen/workspace/bb-plugins/bb-plugin-tasks-plus`, without removing the plugin or its settings. First verify that the original checkout and bundle SHA-256 are unchanged; if they changed concurrently, stop and ask rather than overwrite. Live activation and rollback both need operator authority.

Cleanup after an approved run must use recorded owned IDs only. If any record changed or ownership is uncertain, stop rather than delete it. Dispose the probe, stop traces and close only the context created for this benchmark. Keep raw timing, trace, profiles, source identities and the dataset manifest for paired before/after runs.

## Short manual test

1. Move down, up and back through the owned warm window. Check row key, title and description key after each move.
2. Stage a description edit, inject a fixture-only save failure, then request another task. Confirm the first task and retry control remain.
3. Write distinct unsent comments on A and B. Return to A. Confirm both drafts stay with their tasks.
4. Type arrow keys in an editor and while an overlay is open. Confirm selection does not move.
5. Park, close and reopen Ticket. Confirm accepted task and drafts remain. Check compact host layout and the full 50-comment feed.

## Checkpoint checks

- Test-first missing-module failures were recorded before implementation. Eleven focused Node tests now pass, including a mock page driver. No real-browser run has occurred.
- Tasks: 89 test files, 966 tests pass. Typecheck and repository-local build pass. Lint is blocked because `oxlint` is not declared/installed. Follow-up BBP-104 records this existing setup problem; no unrelated fix was made.
- Quota: 14 test files, 117 tests, typecheck, repository-local build and synthetic bundle OAuth checks pass. No credentials or live quota state were changed.
- Measured median/p95/worst, blanks, long tasks, requests, date work, trace and installed manual safety checks remain unrun. BBP-60 is not complete.
