# Background child observation

BBP-71 adds source-level observation for one background run. Installed retention and completion acceptance have not run. Do not present the provider as lifecycle-safe on the basis of these tests.

## Protocol boundary

Static inspection used pi-subagents 0.75.0 and Pi 0.84.0. The bridge uses the package's documented process-local event-bus RPC, not a copied implementation or an imported package module. It requires RPC v1, `statusProjection` v1, and `asyncStatusSnapshot` kind `pi-subagents.async-status-snapshot`, version 1. There is no package semantic-version field in the public ping. The capability check is the runtime compatibility gate, not a promise about all later package releases.

Status observation requests only `ping` and untargeted `status` through `subagents:rpc:v1:request`. Each request has a unique ID and temporary correlated reply listener. The later read-only capture path uses the registered public inspection command; its separate guard, limits, and persistence boundary are in [SUBAGENTS.md](SUBAGENTS.md). Neither path acknowledges completion, enables extensions, or requests spawn, resume, stop, steer, or management. The package may restore/reconcile its normal status or inspect its own canonical artifacts. BB itself does not read those artifacts or control execution.

The public status snapshot has no session ID. The bridge therefore accepts it only with correlated ping and active-context identities from the same Pi process. Both Pi session ID and exact session file must agree before and after the read. The observer binds the first accepted Pi ID for its generation. Session replacement creates another observer, invalidates old replies, and changes the native item key. Process-local events are a trusted-extension boundary, not authentication against malicious loaded extensions.

`setWidget` with key `subagent-async` and prefix `PI_SUBAGENT_ASYNC_JSON:` is a refresh hint only. Its display text is not authoritative. Widget clearing does nothing. Package ready, async-started, async-complete, child-status, and process-terminal events also request a status read. Their payloads never settle a run directly. Ordinary extension dialogs still use the existing coordinator.

Foreground `subagent` details retain published run/index/agent identities; array positions and fleet display keys never identify a child. They create no native background task. The separate presentation store now captures bounded structured detail for the Subagents panel; it does not parse rendered tool text or alter accounting. See [SUBAGENTS.md](SUBAGENTS.md).

## Bounds and omission

The observer accepts a maximum 32 KiB encoded async snapshot, 20 top-level rows, 8 children per node, depth 3, and 256 nodes per snapshot. IDs and compact text have a 160-character limit. IDs reject truncated display forms. Counts and timestamps must be nonnegative safe integers. Unknown supported-version fields are ignored after bounded JSON validation. The internal status transport has a 128 KiB limit. Foreground inputs have a 64 KiB limit and 64 rows.

Canonical subagent/workflow run IDs must be unique across the snapshot. Step and host-step IDs belong to their parent; repeated local IDs under different parents are valid. Duplicate sibling IDs remain invalid.

Retained state has at most 64 native run identities, 256 nodes per retained tree, and 64 foreground identities. Reaching a limit reports unavailable observation and keeps already-known live work. Terminal identities remain tombstones within the generation, so late running updates cannot reopen settled work.

Missing rows never prove completion, even in a snapshot with zero omissions. Previously observed children remain attached until their IDs receive terminal state. A child promoted to a top-level package row updates its known owning tree instead of creating another native task. Any omitted runs/children or byte-limit flag prevents settlement. Coverage stays tied to the receipt for the owning root. An empty later receipt cannot supply coverage for an earlier incomplete terminal root. This is deliberately conservative. An incomplete or missing canonical record can leave native work open until authoritative evidence arrives or the session ends.

## Native row and settlement

The bridge emits published SDK v3 `item.progress` snapshots with type `backgroundTask`, task type `local_subagent`, and status `pending` while represented execution is live. The native row includes the package label and run ID in its description. Its summary includes reported execution state, elapsed seconds from the package start time, reported tool/activity, and `result not captured`. Missing timing or activity stays explicit. The summary is a bounded observation, not a transcript or a promise of current activity during silence.

All updates, including the terminal snapshot, use the same generation/run key. SDK 0.5.29 permits thread-scoped background snapshots without an open or previous foreground turn. Using a terminal progress snapshot also avoids the SDK's identity change when a progress-only item is later closed. Native runtime background-work tracking uses the item's status on progress events, so a terminal snapshot removes its open-work entry. Static source inspection confirms this rule; tests verify the public assembler's actual IDs and statuses. This is not an installed runtime proof. Native completion timestamps tied specifically to a completed event are not supplied by this path; elapsed time remains in the summary.

Queued/running roots and descendants remain live. A complete, failed, stopped, rejected, paused, or partial root with a live descendant stays pending. When complete supported package coverage has no known live node, complete maps to completed, failed/rejected maps to failed, and paused/stopped/partial maps to interrupted. Partial is not reported as success or as a proven failure. The original package state remains in the summary. A terminal snapshot is emitted once. Inspection availability is separate from execution state and cannot hold execution open. The native summary still says `result not captured`; captured detail is in the separate panel.

Reads have one in-flight request per observer. Package ping/status each time out after one second; the bridge channel times out after three seconds. Hints coalesce for 250 ms. A live observed run gets an unreferenced status-read timer every five seconds. The timer reads status; it does not keep a foreground turn open or manufacture activity. Unsupported or absent packages produce unavailable observation without changing ordinary Pi prompting.

The observer sends no turn-open/boundary events. Parent turns still end through the inherited bridge. It creates no BB child thread, and Pi children do not occupy BB child-thread concurrency slots. Pi still owns child execution and normal result delivery or parent wake.

## Exit, release, and replacement

Exit, explicit release, and session replacement dispose the observer and cancel scheduled reads. Each unconfirmed native run receives one interrupted snapshot with an unknown-outcome message. This ends the local retention claim, not the underlying child's execution. It does not label the child successful, kill it, relaunch it, or promise its survival.

The inherited provider still handles process shutdown, interrupt, and session release. A replacement/resumed Pi session can reconstruct current activity from compatible package status without launching a child. This is fresh observation, not durable recovery of captured results or a guarantee that old artifacts survive. A late reply from the disposed observer cannot alter the replacement generation.

Provider disable, explicit stop, parent-process loss, machine shutdown, and missing canonical artifacts can interrupt result delivery. Observation does not repair these conditions or send a substitute completion prompt.

## Evidence and remaining gates

Owned fake RPC programs exercise the injected extension, real bridge, and published SDK assembler without a model or upstream execution. They check idle parent boundaries, stable native identity, settlement, invalid/foreign status, duplicate events, silence, omissions, descendants, interruption, replacement, stale replies, and ordinary Pi regression behavior.

The literal installed gate still requires an approved bounded test on the declared BB/Pi/package versions. It must establish the actual idle-cleanup interval, keep live child work beyond it while the parent is idle, observe parent-session retention, observe normal completion delivery and any requested wake, and observe final native settlement. Source tests, native-looking rows, short fixture runs, and static runtime inspection do not pass that gate. BBP-70 remains a recorded dependency.
