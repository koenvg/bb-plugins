# Recorded tokens by speed

The host and all-machine dashboards show Normal, Fast and Ultrafast for the selected dates and scope, including in Estimated cost mode. Missing or unknown speed counts as Normal. There is no Unknown speed bucket. Large values use compact labels with exact counts in the accessible description.

## Model and speed graph

The token graph splits each model into Default, Fast and Ultrafast using captured usage from the same request. Default is the graph label for Normal. Only combinations with positive recorded tokens in the selected range appear in the graph, legend, tooltip and accessible table. Estimated cost and other chart metrics keep their existing behavior.

The existing top-eight-model limit remains. Overflow retains its speed split under Other models. Tokens without model detail appear under Unknown model with their recorded speed. This is not an Unknown speed bucket. Separate old cached model and speed totals cannot prove a joint split. If their speed is not all Normal, the graph preserves those speed totals under Unknown model instead of inventing which model used them.

Speed is a recorded request tier, not measured throughput. `fast` and `priority` count as Fast; `ultrafast` counts as Ultrafast; all other values count as Normal. A present response tier, including null or an unrecognized value, takes precedence over exact recorded turn context. No historical speed is inferred from current thread settings.

## Native Codex coverage

Visible-page report preparation reads the selected host's trusted `CODEX_HOME`, or `~/.codex`, under `sessions` and `archived_sessions`. This is independent from configured Pi historical imports and uses the existing host history queue. Preparation may create a private native-only index without installing a Pi collector, changing its controls or granting Pi import consent. Date, metric, ranking and report reads do not scan source files or write history.

Supported modern `token_usage_record` rows must have a validated provider response ID, explicit owning thread ID, original request timestamp and consistent token counts. The first valid session header supplies its workspace. Copied records owned by another thread, conflicting headers and invalid request metadata cannot establish ownership. Repeated response records, archive moves and rescans do not add usage twice. Exact host/provider-qualified response aliases across Pi and native count once, with Pi ownership and its original captured price retained in either arrival order. Equal counters, paths, accounts and root sessions are not duplicate proof.

The pinned installed producer's usage and turn context have no historical per-request tier. Its supported records therefore count as Normal. The native Fast/Ultrafast fixtures test forward-format policy only. They do not prove that installed Codex persists those tiers. See the public producer definitions in `codex-rs/protocol/src/protocol.rs`, `TokenUsageRecord` and `TurnContextItem`.

Legacy `token_count` snapshots do not prove unique requests or fork ancestry and are not added. Their presence leaves coverage incomplete; independently identified modern records still count. This feature does not recover all native history or certify complete active collection.

Native prices remain unavailable. Existing positive captured Pi prices remain unchanged; no current prices or fabricated native charges are added. Cached input is part of input, and reasoning is part of output. Nonzero cache-write formats retain their supported total but have unavailable token classes.

## Storage and safety

Schema 5 adds source/speed metadata and private native cursors/hashed response ownership beside unchanged Pi v1 scalar proofs. Supported schema-4 read-only reports decode all usage as Normal without migration. Guarded writer initialization performs the transactional migration. The incomplete schema-4 identity layout still requires the explicit offline procedure in [STORAGE_UPGRADE.md](STORAGE_UPGRADE.md). Newer/foreign/invalid storage and unsettled WAL remain rejected before writable access; newer headers are rejected before any database open.

A native pass is limited to 128 discovery entries, 2 MiB, 256 lines, a 1 MiB line ceiling and 250 ms. Partial lines are not acknowledged. Malformed or oversized required data stays incomplete. Native backlog does not prevent existing Pi logs from draining. Cancellation rolls back unacknowledged per-source admission and cursor work; the host queue remains held until cleanup completes.

Source reads reject symlink ancestors/files, non-regular files, path escapes, replacement and pipe races. Rollout paths are never executed or followed. Raw message content and partial buffers never enter the index, report or diagnostics. Native extraction does not read credentials.

Existing retention dates and physical pruning remain. Speed survives detail expiry. Compact expiry removes numeric usage and speed metadata while minimal replay/alias evidence prevents resurrection. Native evidence does not change Pi observation counters, collector activation or inactivity certification. Native gaps prevent a combined false zero.

Legacy cached machine reports, days and comparison summaries without speed decode as Normal before validation. Present malformed buckets remain invalid. All-machine totals align actual dates and keep separate machines separate, including offline summaries. Existing cache keys, bounds, enrollment checks and pruning remain.

## Collector upgrade requirement

The Pi collector asset now captures only bounded terminal response ID/tier scalars correlated with the assistant response ID. It does not retain response bodies or throw into provider processing. Metadata is outside immutable v1 usage proofs. Old Pi records and missing correlation remain Normal.

After a future approved plugin deployment, an existing collector may show as incompatible because its asset differs. The operator must explicitly select Repair collector and restart existing Pi sessions to load the changed code. Repair preserves paused state, established control and retained history. This implementation does not install, repair, restart or change a live collector.

## Synthetic verification

- `src/history/native/native-usage.integration.test.ts` uses public prepare/report calls with isolated sources. It covers mixed usage, installed-format Normal, replay, forks, archive moves, alias arrival order, cancellation, classes/prices, confinement, budgets, schema-4 reads and expiry.
- `src/history/usage-speed.test.ts` covers normalization, legacy/comparison decoding, invalid buckets and offline date-aligned sums.
- `scripts/check-bundled-speed.mjs` invokes the actual built host entry. Its mixed fixture produces 450 tokens, Normal 150, Fast 180 and Ultrafast 120, with captured Pi cost 0.03. Removing forward tier fields gives native-only Normal 370, Fast 0 and Ultrafast 0.
- `scripts/prepare-speed-fixture.ts` supplies backend-generated reports to `scripts/browser/speed.spec.ts`. At 375px and 1280px it checks exact accessible counts, dates, host/all-machine scope, metrics, ranking, loading space, retry and offline display. Fixture controls are not installed BB controls.

Run focused/full tests, typecheck, lint, format check, build, `test:bundle` and `test:browser` from this package. Set `CODEX_HOME` to an isolated synthetic path for checks that do not inject a native root. Browser checks use fresh owned Chromium contexts, local resources and blocked external traffic. These checks are not live capture, installed BB navigation, physical-device or screen-reader speech proof.
