# Read-only Subagents detail

BBP-72–75 add source-level detail, capture, parallel/nested structure, and history recovery. Installed acceptance remains the parent's gate. Nothing here certifies child survival, delivery, parent wake, installed UI, or installed reload recovery.

## View and capture

Open **Subagents** from the thread panel actions. Select a child with the pointer or Arrow Up/Down, Home, and End. The tree stays above wrapped detail on narrow screens. It shows available task, recent transcript, final output, state, timing/activity, ownership, capture time, and omission markers. Missing information stays explicit. The view has no spawn, stop, retry, steer, resume, or other execution control.

Background detail uses the package's registered `/subagents-inspect-rpc` command, with a random request ID and published run/child IDs. It requests 20 transcript entries, 2,000 task characters, 8,000 final-output characters, and 1,000 characters per transcript entry. The package reads its own artifacts; BB does not read arbitrary paths. The inspection widget is private to this channel and is not a normal dialog or parent message.

The active context must match the observer's Pi session ID and exact session file. The command must be registered as an extension command. An injected reserved-input guard prevents a missing command from becoming model input. The channel requires a `handled` command disposition and exact reply correlation. Pi replacement, exit, and disposal cancel local waits. No normal prompt, child control, completion acknowledgement, or substitute wake is sent.

Capture has one in-flight read, an eight-entry coalescing queue, terminal-read priority, at least 750 ms between reads, a five-second outer timeout, and a 2.5-second widget timeout. Replies are limited to 64 KiB and supported inspection v1. Queue loss, timeouts, unsupported/malformed replies, missing artifacts, and disposal have explicit capture states. They do not change an established execution outcome or delete accepted output. A root that completes before its descendants gets another final capture attempt when its owning tree settles.

A materialized workflow can hide its canonical ID behind a local step ID. The tree still shows those descendants, but their inspection is unavailable unless the projection supplies an explicit canonical subagent/workflow owner. BB does not send an inner lane key to a guessed outer run. Presentation rows that exceed schema limits are omitted with an explicit unavailable state; their rejection cannot suppress native lifecycle accounting.

Foreground detail comes from structured `subagent` partial/final Details, not rendered text. Published numeric result indices identify reordered parallel rows. Activity/timing use the matching published index; background launch receipts and management results do not create foreground children or a second background task. Payloads above 128 KiB are rejected, with unavailable detail rather than invented output. Accepted detail is clipped to the same task/message/output limits.

## Persistence and recovery

The bridge emits public `extension.state`, qualified as `pi-subagents-provider/pi-subagents-view`, with a declared Zod schema. State version 1 has at most 128 rows and 256 KiB. IDs carry session identity, owning path, and published run/child identity. Repeated local step IDs under different parents stay distinct. No UI object or arbitrary artifact path is stored.

The panel reads public `sdk.threads.events.list` for the newest 64 extension-state events and validates only this provider's qualified kind. It refreshes every four seconds and aborts on disposal. It restores earlier accepted captures within this bounded window when a newer state has an unavailable capture. The original capture time is retained; a failed attempt has a separate attempt time. Old missing live rows become unknown, not successful or proven still running. Unknown versions and malformed state remain explicit. A full history window warns that older captures may be outside the window.

Equal background presentation states are not repeatedly persisted. The process-local store retains at most 64 thread histories. Budgets can omit older rows, with an omission count. This is bounded observation history, not unlimited transcript storage or durable execution recovery. Process replacement can observe existing native work without relaunching it. Public stored captures are independent of whether canonical Pi artifacts remain available, within the view's documented history/budget limits.

## Evidence limit

Model-free source tests and an owned browser preview exercise bounded state, final capture, missing artifacts/capability, correlation, timeout, foreground/parallel identity, nested ownership, keyboard selection, wrapping, and refresh. They do not prove installed BB persistence, Pi process replacement/reload, idle retention, real final delivery, or parent wake. BBP-70/71 dependencies and the recorded task gates remain in place.

The current source SDK gate passes on BB 0.45.0 / SDK 0.6.15 after BBP-156. See [source and installed compatibility](COMPATIBILITY.md#sdk-packaging-on-bb-0450). This source pass does not complete installed acceptance.

The historical BB 0.44.0 / SDK 0.5.29 checker result remains failed, exit 1. Its [provider-only exception](../.pi/skills/verify/references/pi-subagents-sdk-exception.md) stays limited to that exact diagnostic and version pair. Replacement checks are not a checker pass. The exception does not apply to the current source or the installed build's BB 0.45 incompatibility.
