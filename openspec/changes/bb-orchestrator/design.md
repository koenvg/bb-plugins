# Design

## Approved manual-first boundary

The BBP-33 manual-first contract replaces the original automatic coordination design for the first release. Scope approval is a record, not an execution capability. An active scope record and a running native worker are separate facts.

Production registration wires the existing RunController, a non-notifying Reporter, a deferred Dispatcher and synchronous coordination readers. It registers no new message.dispatch hook or report delivery event callback. No public option enables notification execution.

## Stored reports

Migration 10 stores immutable report JSON and separate delivery JSON with a unique worker/key identity. Reports and linked comments commit atomically; notifiedCount is zero. New delivery is suppressed with a manual-first reason, no receipt, no attempted time and no private receipt intent. References and questions are bounded. Status does not infer task completion, artifacts or acceptance.

The native host supplies worker/project identity. An attached worker or retained original recoverable claim must match the linked BB project and association/owner context. CLI environment and editable metadata cannot mint authority. Recovery lookup requires original claim/run/native-parent/plugin creation facts and a unique original child. Private capabilities are hashed, bounded and origin-scoped; only a private file location is returned.

Production new native reports use only the previously verified Pi/BB 0.44.0 origin bridge. Other paths refuse. Isolated candidate fixtures do not expand support claims. Identical retries return the original immutable report/comment and historical delivery state. No retry, enable, reload or event replays or settles an old notice. Migration-10 private receipt intents remain stored for evidence.

## Deferred execution and retained bookkeeping

Dispatcher dispatch/adopt handlers return deferred before eligibility reads, seed preparation, claim reservation, worker creation or attachment. Strict public inputs remain additive. Role history and claims stay readable; no worker is retagged. Ordinary Tasks delegation, attach/detach and comment notification remain separate.

The synchronous coordination-reader signature stays unchanged and preserves explicit unknown/absent/present, bounded omissions and external observation times. Native dependency readiness is not artifact delivery. The read path is not authorization to execute anything.

BBP-37 owns bookkeeping-only reconciliation, original-child attachment and explicit operator resolution. BBP-42 integrates its live/released hasHistoryForThread semantics and attachment history. Recovery may link existing records after verified context, but does not spawn, send, resume or automatically replace children. The original claim has priority over new adoption.

## Scope controls and skill

Retain exact persisted invocation parsing, one native form, decision identity validation, source expiry, tracker fingerprints, full preset snapshot and baseline intent. Begin/resume can change scope-record phase only after the retained native approval. Pause records paused without sending stop or cancellation. A new plugin generation reads old active scope as interrupted, not resumed.

BBP-51 remains the known temporary provenance limit: BB-recorded user/null attribution is not independent human-identity proof. No chat approval substitutes for a native submitted form. Unverified provider paths fail closed. Restricted operations and added scope retain separate approvals.

The bundled skill uses only scope controls and status reads. It summarizes records and returns operator decisions needed. It neither uses ordinary Tasks/thread APIs to reconstruct deferred automation nor assigns repository work itself. The coordinator remains contracts/artifacts only.

## Historical execution limit and rollout

The reporting fixture observed two post-pause executions, including two logged exact-receipt final plugin rejects followed by a new provider turn. The executing attempt's authorization and Core cause remain unknown. BBP-121 also recorded contradictory public Send-now semantics. This cut removes new agent input; it does not fix or disprove those failures.

The sole original fixture remains paused, hold true and gate loaded with reports/intents/approvals/private capabilities intact. Before BBP-38 handoff, use fresh bounded read-only state/queue/provider/registry checks, or report the deviation and separate cleanup approval needed. This does not authorize queue mutation, input, reload, unload or teardown.

No new migration, SDK pin, provider change or scheduler is part of this cut. Legacy tables and accepted native work cannot be cancelled by package rollback. Any future gate unload requires separately approved actual queue reconciliation and verified safe cleanup first.

## Verification and ownership

Production-entrypoint tests cover startup/reload, native-approved scope bookkeeping, all deferred dispatch/adoption roles, stored report tool/CLI/RPC paths, wrong workers, immutable retries and retained legacy deliveries/intents. Existing Tasks tests protect ordinary manual delegation and notification behavior. Run focused/full tests, types, lint, build and diff checks. Run exactly one read-only fresh-context complete-diff review for BBP-38; fix findings and rerun affected checks.

BBP-39/40/41 remain deferred. BBP-42 integrates the three retained handoffs and verifies UI/browser wording, recovery and the no-agent-input contract separately. Final epic acceptance, publish/merge/production actions and fixture cleanup are not implied by this local handoff.
