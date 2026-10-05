# Recover an interrupted dispatch

Read this when creation or attachment is uncertain, when you know an original child ID, or before you release a claim, replace an owner, disable, or roll back Tasks.

## Find the original first

Use the original task, run, coordinator and claim from compact status. In that coordinator's context:

```sh
bb tasks orchestrate reconcile ABC-12 --run <run-id> --claim <claim-id> --json
bb tasks orchestrate link ABC-12 --run <run-id> --claim <claim-id> --worker <original-thread-id> --json
```

These are bookkeeping commands. They can attach an already active original without another spawn, seed, send, resume or delete. They preserve its native parent. Paused and interrupted runs stay paused or interrupted. A later run cannot retag an old claim or owner.

The RPC methods are `orchestrateReconcile` and `orchestrateLink`. Both require `runId`, `coordinatorThreadId`, `taskId`, `role`, and `claimId`. Link also requires `threadId`. Only the implementation role is supported here. CLI `--thread` selects the coordinator outside thread context; it cannot override the invoking thread.

Read `outcome`, `claim`, `threadId`, `candidates`, `complete`, `observedAt`, `reconciliationId`, and `warning`:

- `recovered` attaches the unique verified original. Local association, designation, comment, eligible status and claim commit together.
- `reused` returns the original designation without requesting execution. An admission-rejected claim stays admission-rejected.
- `unresolved` retains uncertainty. Zero matches do not prove absence. Multiple matches, unavailable metadata, failed/interrupted reads and incomplete listings block automatic progress.

Recovery checks current BB project, actual parent, plugin origin and strict version-1 metadata against the durable attempt. Metadata is a lookup hint, not permission. A known identity with conflicting metadata or another live claim refuses linking. Legacy adopted identities use their exact durable association; recovery does not move their native parent.

The listing bound is 100 live and 100 archived plugin-origin threads in the linked BB project, including hidden threads. A saturated 101-row probe is incomplete. Metadata and direct identity reads must succeed. `complete` describes the bounded observation, not proof that delayed creation is impossible. There is no lease expiry, polling loop or startup retry.

## Make an explicit operator decision

First reconcile. For an existing attached owner, reconcile again if the first call changed local attachment. Use the resulting reconciliation identity in the exact recorded decision below.

For release, the operator submits one fresh, leading BB text decision in the original coordinator thread:

```text
/tasks-orchestrate-resolve {"runId":"<run-id>","coordinatorThreadId":"<coordinator-id>","taskId":"<task-ulid>","role":"implementation","claimId":"<claim-id>","action":"release","associationId":null,"reconciliationId":"<reconciliation-id>","acknowledgeDelayedCreation":true}
```

Then the coordinator applies that recorded request:

```sh
bb tasks orchestrate resolve ABC-12 --run <run-id> --claim <claim-id> \
  --action release --reconciliation <reconciliation-id> --request <request-id> \
  --acknowledge-delayed-creation --json
```

For replacement, use `"action":"replace"` and the exact current task association ID in `"associationId"`. Add `--association <association-id>` to the CLI and use `--action replace`. The operator selects an already attached usable worker. This command does not create one, change its parent, or send it work. A worker correlated with another attempt must be recovered in that original context instead.

RPC `orchestrateResolve` takes the exact decision fields plus `requestId`. The request must be the latest BB-recorded user/null turn, within 15 minutes, with one visible text input and no mixed authors, quote, mentions or retry. All task/role/run/coordinator/claim/association/reconciliation fields must match. The handler performs fresh native reconciliation before the local commit. A changed result requires a new decision. A newly found unattached original takes precedence and is recovered instead of replaced.

This is the approved temporary BB-recorded boundary. BB 0.44.0 agent self-sends can receive user/null attribution. It does not prove human identity. BBP-51 tracks the stronger boundary. A metadata token or task completion does not establish a decision or absence.

Active or reserved creation cannot be released, even after restart or a long delay. Active and usable originals cannot be replaced. A failed, archived, deleted or verifiably manually stopped owner can be replaced by explicit decision. Unknown identity or interruption history remains unresolved.

Release records risk acceptance, not proof of failure. A delayed original can still appear and duplicate work can result. The handler retains the old claim, original run/coordinator, association IDs, prior diagnostic reason and a versioned resolution record linked to a readable system comment. Replacement clears only the old primary designation and creates a new local claim for the selected association. Old associations remain available as history. Identical decision retries return the recorded result; conflicting decisions refuse.

A replacement retry returns the exact recorded replacement claim and worker, not the failed original. Missing, released or changed replacement ownership, association or native project returns `unresolved` without replay. Retained orchestration associations remain history. Recovery replacement refuses any previous orchestration claim or native correlation. New dispatch/adoption remains deferred. Ordinary operator-led manual attach/detach remains available.

Resolution has no spawn, seed, send, queue, resume, recheck, wakeup or delete side effect. Recorded release and replacement preserve bookkeeping only; they do not grant execution. All new dispatch and adoption requests remain deferred, including retries after release or replacement. Diagnostic text, native metadata and old resolution records never grant execution. Historical original identity remains available for explicit reconciliation.

## Disable or roll back safely

1. Pause the run through its explicit run control.
2. Inspect existing native queued and in-flight work. Remove or resolve queued orchestration requests through existing BB controls before disabling the plugin. Stop only workers the operator explicitly chooses.
3. Back up Tasks data, including claims, associations and comments. Keep the fork's data; migration 9 remains unchanged by recovery.
4. Disable or roll back the package. Neither action cancels already accepted BB work. No production orchestration admission or delivery callback is registered in this release. An external fixture gate is a separate control and must not be unloaded while work is queued.
5. After enable or restart, read status and reconcile explicitly. Enable never grants worker execution. An interrupted scope record needs explicit scope resume; even resumed scope does not send input or start a worker.

The installed disposable check demonstrated the unsafe order: disabling a gate while a seed remained queued let BB start provisioning that existing child. Corrected cleanup before disable/enable left the archived child, paused run and empty queue unchanged. See the [verification notes](../../../orchestration/recovery-verification.md).

Legacy dispatch warnings, manual attach/detach and last-commenter notifications remain unchanged. Recovery is not a scheduler or whole-epic acceptance.
