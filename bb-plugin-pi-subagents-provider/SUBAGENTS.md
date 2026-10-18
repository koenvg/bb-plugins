# Read-only Subagents detail

BBP-72–75 add source-level detail, capture, parallel/nested structure, and history recovery. Installed acceptance remains the parent's gate. Nothing here certifies child survival, delivery, parent wake, installed UI, or installed reload recovery.

## Native background activity

Async subagent runs also appear as normal BB background task rows alongside the detailed Subagents panel. These rows remain eligible for BB's background-agent activity count after the main agent finishes its turn. The bridge does not hold the parent turn open or create an extra turn merely to show child work.

A represented run stays pending while it or its descendants are live. Authoritative completion, failure, or interruption settles its native item. This payload behavior is covered by source tests; installed activity, idle retention, and completion delivery still require live acceptance.

## Composer shortcut

Click the existing native background-agent bar above the composer, or focus it with Tab and press Enter or Space. A matched wide single-run bar opens that background root in Subagents. Aggregate and narrow bars open an overview with no run selected, including before their first expansion. Choose a captured run in the panel to read its detail. Your manual choice survives history refresh.

No second bar, button, or replacement indicator is added. Native text, timing, activity counts, and aggregate expansion remain intact. The transcript indicator is unchanged. Navigation leaves the parent chat and draft intact and sends no agent request or execution command.

This shortcut uses a trusted content script to match private BB composer DOM. Its fixtures are based on BB 0.45.0 and SDK 0.6.15. Panel navigation and history reads use the public SDK, but DOM matching is not an SDK compatibility promise. A BB upgrade can disable the shortcut. Unrecognized shapes, another selected provider, missing observations, or multiple ambiguous composer contexts leave the bar unchanged. Open Subagents from the thread panel actions when the shortcut is unavailable.

Disabling or replacing the plugin removes its added listeners, observer, focus styling, and owned accessibility hints. Local tests cover these behaviors; installed layout and reload acceptance remain required.

## View and capture

Open **Subagents** from the thread panel actions. Select a child with the pointer or Arrow Up/Down, Home, and End. The tree stays above wrapped detail on narrow screens. It shows available task, recent transcript, final output, state, timing/activity, ownership, capture time, and omission markers. Missing information stays explicit. The view has no spawn, stop, retry, steer, resume, or other execution control.

Background detail uses the package's registered `/subagents-inspect-rpc` command, with a random request ID and published run/child IDs. It requests 20 transcript entries, 2,000 task characters, 8,000 final-output characters, and 1,000 characters per transcript entry. The package reads its own inspection artifacts. Optional model enrichment reads only a separately proven local child session under the host-owned bridge root, as described below. The inspection widget is private to this channel and is not a normal dialog or parent message.

The active context must match the observer's Pi session ID and exact session file. The command must be registered as an extension command. An injected reserved-input guard prevents a missing command from becoming model input. The channel requires a `handled` command disposition and exact reply correlation. Pi replacement, exit, and disposal cancel local waits. No normal prompt, child control, completion acknowledgement, or substitute wake is sent.

Capture has one in-flight read, an eight-entry coalescing queue, terminal-read priority, at least 750 ms between reads, a five-second outer timeout, and a 2.5-second widget timeout. Replies are limited to 64 KiB and supported inspection v1. Queue loss, timeouts, unsupported/malformed replies, missing artifacts, and disposal have explicit capture states. They do not change an established execution outcome or delete accepted output. A root that completes before its descendants gets another final capture attempt when its owning tree settles.

A materialized workflow can hide its canonical ID behind a local step ID. The tree still shows those descendants, but their inspection is unavailable unless the projection supplies an explicit canonical subagent/workflow owner. BB does not send an inner lane key to a guessed outer run. Presentation rows that exceed schema limits are omitted with an explicit unavailable state; their rejection cannot suppress native lifecycle accounting.

Foreground detail comes from structured `subagent` partial/final Details, not rendered text. Published numeric result indices identify reordered parallel rows. Activity/timing use the matching published index; background launch receipts and management results do not create foreground children or a second background task. Payloads above 128 KiB are rejected, with unavailable detail rather than invented output. Accepted detail is clipped to the same task/message/output limits.

Capture version 1 also accepts optional `resolvedModel: { provider, model, capturedAt }`.
Provider IDs are limited to 160 characters, model IDs to 256, and capture time uses the existing nonnegative timestamp bound.
Only the latest actual provider/model pair in an attributed foreground child's assistant records or a qualifying completed local child session supplies this value.
Requested model options, parent selections, siblings, and workflow containers are not model sources.
The metadata has its own capture time, retained if newer captures lack model evidence. It is captured information, not a certified live model feed.
Current background snapshots and inspection v1 replies publish no resolved model. The bridge adds optional evidence only after successful inspection normalization. Model fields in events, selections, usage, and inspection replies are not evidence.

Transcript entries can retain optional `name` up to 160 characters and boolean `isError` from inspection.
Foreground text, tool-call arguments, and tool results stay separate in source order. Tool results keep their supported tool name and error flag.
A tool error does not change execution outcome; no call/result pairing or tool timing is inferred.
The 20-entry limit applies after foreground block expansion. Entries omitted by this limit and clipped text remain disclosed.
Old captures without these fields still parse. For example, an entry with `role: "toolResult", kind: "toolResult", text: "denied"`
can additionally carry `name: "bash", isError: true`; both forms are accepted.
No schema version, row/byte budget, capture queue, or session/request correlation boundary changes.

## Restricted background model evidence

BBP-225 adds a temporary read-only workaround while upstream issue #2922 remains unresolved. It covers only successful, direct, fresh, local single async children whose launch and completion this Pi process generation observed. It does not backfill historical captures.

The package's start event must belong to the exact host-created parent file and current runtime session envelope. Its executor UUID is distinct from the async run UUID. The executor directory must already exist directly under the host-derived parent stem. Before completion, the bridge must observe `ENOENT` for that exact `run-0` directory or `run-0/session.jsonl` file. An existing file, probe error, missed start, or completion racing the probe makes the run ineligible. Completion must explicitly supply both indexed original `sessionFile` and normalized `sessionPath` for that same file, index 0, fresh context, and successful single mode. Top-level path fallback is not used.

The permitted root comes from `session-paths.ts`, including `BB_PI_SUBAGENTS_BRIDGE_SESSION_DIR`, never an event root. The reader checks ownership, permissions, containment, symlink components, single-link regular-file identity, stable descriptor metadata, and ancestry before accepting evidence. It uses one read-only no-follow descriptor and bounded reads, not Pi's repairing session loader. Complete supported v3 UTF-8 JSONL must have a matching parent, distinct child header ID, unique entry IDs, valid references, and linear history. Timestamps can reject inconsistencies but do not prove freshness. Only the latest persisted assistant's completed `provider` and `model` pair counts. An unusable latest assistant does not select an older answer. `responseModel` is not substituted.

Limits are 64 evidence records and 64 KiB of retained metadata, one entire file of at most 512 KiB, a 4 KiB header, 64 KiB records, and 2,048 total records. Saturation declines new eligibility without eviction or rearming. One operation gate covers probes and reads. Optional work gets at most 250 ms inside the remaining five-second capture budget. A logical timeout cannot cancel an OS syscall; the gate stays occupied until cleanup. Failure leaves the normalized inspection intact. A newly ready exact run gets one coalesced recapture even after terminal detail was captured. Disposal, replacement, generation changes, or conflicting reuse invalidate late evidence. No private transcript content or file route is logged or persisted by this reader.

Workflow containers, nested descendants, external or remote runners, forks, revival/reused paths, missed events, unsupported formats, unsafe paths, oversized sessions, and busy or timed-out reads remain Model unavailable. Conservative checks can exclude otherwise valid children. Foreground behavior, native lifecycle, inspection limits, stored schema v1, and accepted model-capture times remain unchanged. Source and scripted-Pi fixtures do not establish installed acceptance or live coverage on Pi 1.1.0/1.3.0.

## Persistence and recovery

The bridge emits public `extension.state`, qualified as `pi-subagents-provider/pi-subagents-view`, with a declared Zod schema. State version 1 has at most 128 rows and 256 KiB. IDs carry session identity, owning path, and published run/child identity. Repeated local step IDs under different parents stay distinct. No UI object or arbitrary artifact path is stored.

The panel reads public `sdk.threads.events.list` for the newest 64 extension-state events and validates only this provider's qualified kind. It refreshes every four seconds and aborts on disposal. It restores earlier accepted captures within this bounded window when a newer state has an unavailable capture. The original capture time is retained; a failed attempt has a separate attempt time. Old missing live rows become unknown, not successful or proven still running. Unknown versions and malformed state remain explicit. A full history window warns that older captures may be outside the window.
A full 64-event window shows a history-limit notice in the panel. It does not invalidate supported current observations or disable navigation to a uniquely matched current background root. An unsupported latest state, a read failure, or unavailable ownership still leaves native navigation untouched.

While a panel stays mounted, a row still present in the current replay retains its previously observed task text if newer events lack it. This reader-local attribution uses the full row identity and stays within the same 128-row/256-KiB budget. It does not retain absent rows, borrow another run's task, or extend transcript, output, model, or durable-history retention. New task text replaces retained text; task clipping remains disclosed. Changing threads or closing the panel releases this local attribution. A newly opened panel can therefore show task unavailable when an already open panel still has previously observed attribution.

Equal background presentation states are not repeatedly persisted. The process-local store retains at most 64 thread histories. Budgets can omit older rows, with an omission count. This is bounded observation history, not unlimited transcript storage or durable execution recovery. Process replacement can observe existing native work without relaunching it. Public stored captures are independent of whether canonical Pi artifacts remain available, within the view's documented history/budget limits.

## Evidence limit

Model-free source tests and an owned browser preview exercise bounded state, final capture, missing artifacts/capability, correlation, timeout, foreground/parallel identity, nested ownership, keyboard selection, wrapping, and refresh. They do not prove installed BB persistence, Pi process replacement/reload, idle retention, real final delivery, or parent wake. BBP-70/71 dependencies and the recorded task gates remain in place.

The current package targets BB 0.46.1 / SDK 0.6.49. See [source and installed compatibility](COMPATIBILITY.md#sdk-packaging-on-bb-0460). Passing source checks does not complete installed lifecycle acceptance.

The historical BB 0.44.0 / SDK 0.5.29 checker result remains failed, exit 1. Its [provider-only exception](../.pi/skills/verify-bb-plugins/references/pi-subagents-sdk-exception.md) stays limited to that exact diagnostic and version pair. Replacement checks are not a checker pass. The exception does not apply to the current source or the installed build's BB 0.45 incompatibility.
