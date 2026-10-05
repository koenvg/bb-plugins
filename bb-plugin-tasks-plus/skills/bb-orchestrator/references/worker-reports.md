# Stored worker reports

## Manual-first writes

`tasks_report` stores completed, review_ready, blocked, failed or needs_decision outcomes with a bounded summary and typed result references. Needs_decision requires a question. The native host supplies worker/project identity. The task must have that worker's validated association or a retained original recoverable claim. Metadata or CLI environment identity is not authority.

The report and linked non-notifying agent comment commit together. Task and run status stay unchanged. A new report has delivery `suppressed`, a manual-first reason, null receipt/reference and no attempted timestamp. It creates no receipt intent and performs no agent send, spawn, queue call or hook recheck. No new report-admission hook or delivery event listener is registered.

Production permits only the previously verified Pi native-origin storage path on BB 0.44.0. The historical bridge proved native reporting/private capability/CLI/RPC, not pause-safe notification delivery. Other provider/version paths refuse new native issuance; isolated candidate tests are not installed support.

## Provenance and retries

Original task/thread/project, association, role, claim, run and coordinator remain immutable. Identical worker/key retries return the original report/comment/delivery even after detach or reload. Changed payloads refuse. A new write rechecks local context after external reads and before commit. Reports never attach, adopt, change task status, approve scope, establish artifact readiness or accept an epic.

Native `tasks_report_context` writes a private file with mode 0600 and returns only its path/host. Storage keeps an origin-scoped capability hash, not the token. Lifetime is 24 hours and at most eight live contexts per worker. Keep the file contents out of arguments, logs, metadata, comments and attachments.

A worker with its native-issued context can store a report:

```sh
bb tasks report PROD-2 --key result-1 --outcome review_ready \
  --summary "Focused checks pass. Review is pending." \
  --result '{"kind":"commit","reference":"<sha>"}' \
  --baseline 'commit:<base>' --context-file '<private-path>' \
  --machine '<returned-host-id>' --json
bb tasks report-show '<report-id>' --json
```

CLI `report-context` refuses minting. RPC `reportWorker` requires the capability, not a supplied worker ID. `readWorkerReport` returns the stored record. This reporting route does not notify an agent.

## Honest readers and retained delivery evidence

The synchronous Tasks-owned ReportStore provides get, retry, latest, getForRun, decisions and deliveries. It makes no BB calls and reconstructs nothing from comments. getForRun requires the immutable origin run; it does not authorize an action. Lists expose items/total/omitted with integer limits 0..100.

Compact status includes bounded summaries, result/baseline references, unresolved question origins and delivery state. New suppressed delivery is manual, not uncertain transport or success. Historical pending, queued, native, sent, failed and ambiguous states remain as recorded. Earlier private receipt intents, claims, approvals and context rows are preserved without replay or fabricated settlement. A stored failed delivery does not prove no native execution.

Automatic notifications, answers, artifact delivery and integration/acceptance-role orchestration are deferred. BBP-39/40/41 are backlog, not completed. Ordinary comment --notify still targets the prior latest responder and Unblocked comments remain non-notifying. This skill does not invoke those ordinary controls as substitute automation.

The original installed fixture failed two post-pause delivery checks. No Core cause is proved. The manual-first cut does not repair it or authorize fixture controls or teardown. Preserve the loaded paused gate, hold, private capabilities and failure evidence pending separate cleanup approval.
