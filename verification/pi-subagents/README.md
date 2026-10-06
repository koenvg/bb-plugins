# Pi subagent acceptance controls

These tools support BBP-69 and BBP-77. They do not change the provider, BB, the SDK, Pi settings or the weekly monitor. They do not authorize a live agent test.

## Checks without a model

```sh
node --test verification/pi-subagents/*.test.mjs
node verification/pi-subagents/deadline-guard.mjs --help
```

The tests use a virtual clock, fake public-command responses and one separate Node fixture process. They do not start Pi or native subagents. These checks do not prove installed lifecycle safety.

## Independent deadline control

Run `deadline-guard.mjs` in its own Node process. Do not make the model prepare a stop command when a deadline is near. The guard never dispatches a prompt. The coordinator owns dispatch, evidence collection and acceptance.

1. Obtain a new bounded phase approval. Keep all closed ledgers unchanged.
2. Create only owned fixture records. If a prompt is queued, schedule it beyond the phase deadline. Record its exact message ID. Do not let it dispatch before the guard is armed.
3. Write the approved action plan. Use the earliest action start time, including fixture or queued-prompt creation. Do not reset the clock when the guard starts.
4. Start `node verification/pi-subagents/deadline-guard.mjs --run PLAN.json` with a private controller input channel and retained stdout/stderr. Wait for the `armed` receipt and check the process identity before dispatch.
5. Dispatch the owned queued prompt through the existing public CLI. Keep the approved provider, model, reasoning, service tier and permission selection. Do not change defaults or profiles.
6. Send validated identity and exclusive native PID receipts to the guard. Keep the original public events, process correlations and timestamps separately.
7. Send completion only after the required canonical outcomes are observed. Child output or a captured result alone is insufficient.
8. If the guard fails, stop the phase. Perform only scoped cleanup within the remaining phase budget. A stop acknowledgement alone does not prove PID absence.

The plan has these required fields:

```text
threadId, ownerThreadId, approvalReference, caseKind,
phaseStartedAtMs, phaseDeadlineMs, startedAtMs, limitMs, stopReserveMs
```

`approvalReference` is the BB comment ID which records the operator's fresh bounded approval. This field is a reference, not an authentication mechanism. A local JSON file cannot grant approval. `caseKind` is `native` for the critical completion case or `idle-control` for the sweep control. Include `queuedMessageId` if this action owns a queued message.

Keep at least 30 seconds for stopping and absence checks. For a normal 120-second action, native work and the parent response must finish before 90 seconds. The guard also enforces the original action limit. A stuck cleanup remains failed. It does not silently extend the limit to a separate hard cap.

Input is newline-delimited JSON from the trusted coordinator, never child output:

- `bind`: `threadId`, `scope` with the native `sessionId` and exact `environmentId`. For `native`, include the canonical `runId`, `itemId` and positive integer `generation`. Bind once. Do not invent IDs or reuse an old generation.
- `pids`: `threadId`, `pids` with `{pid, start}` records. `start` is the exact normalized `ps -o lstart=` value. Include exclusive native parent, child and owned tool processes. Do not include the shared host daemon, shared provider worker or the controller. Do not remove an earlier PID receipt to hide a running process.
- `complete` for `native`: matching `threadId`, `sessionId`, `runId`, `itemId`, `generation`; `nativeSettlement` and `parentResponse` both `completed`; `completionNoticeObserved` and `parentResponseHasOwnedResult` both `true`. Back these fields with the normal native settlement, same-parent completion notification and the completed response which contains the owned result.
- `complete` for `idle-control`: matching `threadId` and `sessionId`, plus the original `log` release record for this control thread in this environment.

The guard deletes only the named queued message, then attempts the exact owned thread stop. Queue read failure does not suppress that stop attempt. It checks idle state, an empty queue and absence of the recorded process identities. It never kills a process by name. PID reuse is not permission to signal the replacement process.

The guard's `passed` field reports controller completion and timely cleanup only. It does not certify provider acceptance, log authenticity, result ownership or refresh persistence. The parent must check the original evidence. The generic `controlAction` interface is available for short foreground, parallel and expected-failure cases whose canonical receipt differs from the critical background case.

## Proof of an actual eligible sweep

BB0.44.0 logs `Reaped idle provider sessions` only for a nonempty release. It does not log successful zero-release sweeps. Keep the static source receipt separate from live evidence.

Use two owned fork fixtures in the same environment:

1. Launch the genuine target child. Wait for native pending work to be accepted after the real parent reaches safe idle.
2. Allow the native one-time attention turn to finish. Observe target idle before dispatching the control's ordinary no-child prompt. Do not manufacture a keepalive turn.
3. Observe the control's normal completed turn and idle native session. Leave both sessions alone. Collect server events and process identities. Do not send target inspection, prompt, stop or other host runtime commands during the eligibility interval.
4. Retain a genuine daemon release log for the control with `providerId=pi-subagents`, the exact shared environment and `idleForMs >= 1800000`.
5. Prove that the target had no foreground turn after control dispatch. Retain complete event coverage. The control began later, so its daemon-measured eligible idle also proves target eligibility. Do not derive host idle time from server timestamps.
6. After the log, verify that the same target native parent and child identities remain alive and the same accepted native item remains pending. The log must not release the target. A renewed process or a changed item is not retention proof.
7. Let the target child complete naturally. Verify same-parent wake, one normal successful settlement, the parent result, owned detail capture and real browser refresh persistence before the action cutoff.

`assessSweepWitness` checks this data relationship. It cannot authenticate the daemon log or establish event coverage. Missing logs, an extra target foreground turn, incomplete coverage or changed identities leave sweep proof unproved. Stop the phase instead of extending its window.

## Watcher and signal coordination

BBP-135 adds three modules outside the provider package:

- `openSweepLog` in `sweep-log.mjs` reads a positive release from an owned log directory. It reads after every directory or file notification, even if the notification has no filename or names the directory. It arms file notifications before obtaining fresh read metadata. It checks the pinned directory identity during scans and before accepting a frame. It reads a bounded startup tail and handles split UTF-8, incomplete lines, replacement and truncation. Missing notifications still fail with a timeout. It does not poll or infer a sweep from elapsed time.
- `proveSweepTarget` in `sweep-proof.mjs` checks the raw log hash, complete public event sequence, current owning root row, post-sweep pending native item and original parent/child process identities. A local-step row cannot replace the root. The caller must establish `coverageComplete` from a full public event read. A contiguous prefix alone is insufficient.
- `createSweepCoordinator` in `sweep-workflow.mjs` handles one signal action. Use one instance per owned action in a separate Node controller. Repeated input cannot dispatch another signal or stop. It arms the signal guard before writing, checks the original target cutoff and child expiry, and requires the normal owned result with persisted detail. Early or error completion does not pass.

The watcher permits at most 32 selected log files, a 64 KiB initial tail per file, 32 KiB per complete line, 64 MiB file size and 16 MiB cumulative read bytes. It rejects non-regular files, symlinked or replaced directories, changed ownership, invalid UTF-8, BOM-prefixed JSON or malformed release lines. Its source inode, UID and raw SHA256 receipt establish what was read. They do not authenticate the daemon or grant approval. The directory and input channel must come from the trusted coordinator, never child/model output. The initial tail is not a complete historical log audit.

Before dispatching the later idle control, call `validateSweepTiming`. Budget the control's latest idle time, the 1800-second threshold, a possible 300-second sweep delay, bounded proof and guard setup, normal completion and stop reserves. Cadence is only a scheduling budget, not evidence. The recorded guarded69b plan is rejected because its late control left insufficient time before child expiry. Do not extend the target or signal window to make a plan fit.

The coordinator uses named public-command ports. None has a default live BB implementation. `authenticateRelease` must match the original log to the recorded daemon identity. `readTarget` returns raw public events and correlated exclusive process rows. `completeControl` sends only its owning session's canonical log. `armSignal` returns the independent guard's PID/start and exact cutoff/deadline. Its cancellation signal bounds the arming operation, not the guard's lifetime. `writeSignal(scope, signal, window)` receives the earlier child-expiry/action cutoff as `window.deadlineMs`, plus the monotonic-derived `window.nowMs()` clock. It must check cancellation and this deadline immediately before synchronous exclusive file creation, after any asynchronous preparation. It creates only the new owned fixture signal. The coordinator cancels a stalled write at that earlier deadline and rejects a late return. It cannot prevent writes by an adapter that ignores this contract. It must not use a child-supplied path, stop a native child or acknowledge completion. `waitForCompletion` backs all fields with the actual native notice/settlement, parent response, intended result and owned persisted detail.

`cleanup` has one owner. Reuse the target guard's stop and absence result; do not add a second direct thread stop for the signal action. The cleanup port must also retire and verify its owned signal guard. All ports must honour cancellation and command/output bounds. `readClosed` returns fresh public thread/whole-queue data, exact native PID rows and the signal guard's `guardPidRows`. Guard lifecycle states are not-started, arming and bound. After arming starts, a missing or malformed reply cannot reset the state to not-started. A live or unbound signal guard leaves absence unproved. `archive()` reads this data again before calling the owned archive port, within the original action deadline. It retains the pre-archive observation and refuses old fixtures, remaining queue messages or unproved absence. This is a readback checkpoint, not an atomic queue/archive transaction.

The source tests use temporary files, controlled OS notifications and fake public-command responses. The full log-to-signal-to-cleanup path writes only a new temporary fixture file. The original missed-event cause remains unproved. The tests establish repaired behavior for concrete failure mechanisms; they do not retroactively pass the failed live phase or prove installed lifecycle safety.

## Live approval is separate

All four historical/live ledgers are closed. The guarded69b phase failed. BBP-135 approval permits source repair, model-free checks and one completion review only. It does not permit another fixture, prompt, native child, PID signal, installation, reload, SDK/profile/settings/default change, monitor operation or publication.

Any later live phase needs new bounded approval and a fresh protected-state check. Keep old failures and unused capacity unchanged. Fresh-generation accounting before observed safe idle and recursive delegation remain accepted unavailable. The weekly monitor remains separate maintenance. The later Pi settings hash mismatch is not authorization to restore or silently accept settings bytes.
