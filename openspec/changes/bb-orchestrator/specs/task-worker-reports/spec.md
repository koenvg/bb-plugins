# Task worker reports spec delta

## Purpose

Store explicit bounded worker outcomes and readable non-notifying comments. Notification, answer routing and automated artifact/integration delivery are deferred for this release.

## ADDED Requirements

### Requirement: Immutable task-linked reports
Workers SHALL report completed, review_ready, blocked, failed or needs_decision, with bounded summary and typed result/evidence references. Needs_decision SHALL require a question. Native worker/project identity or its private origin-scoped capability SHALL match an attached worker or retained original recoverable claim. Reports and readable comments SHALL commit atomically with zero notifications. Task/run status, artifact readiness and epic acceptance MUST NOT change from reporting.

#### Scenario: Report while active or paused
- **WHEN** a validated worker stores an outcome
- **THEN** the report/comment retain original task/thread/association/claim/run/project/role and issue no agent input

#### Scenario: Wrong worker
- **WHEN** identity is supplied through caller IDs, CLI environment or metadata without genuine native/capability authority
- **THEN** the write refuses without attachment, status mutation or notification

### Requirement: Retry identity and historical preservation
The worker/key identity SHALL deduplicate identical payloads to the original report/comment and delivery state, including after detach/reload. Conflicting payloads SHALL refuse. Earlier contexts, receipt intents, failures and claim/approval history SHALL remain stored without replay, new receipt binding or fabricated settlement.

#### Scenario: Legacy queued report retry
- **WHEN** the worker repeats a historical report identity
- **THEN** the original queued/failure/uncertain delivery stays as recorded, and no send/recheck/queue action occurs

### Requirement: Manual delivery status
New reports SHALL expose suppressed delivery with a clear manual-first reason, no delivery receipt/reference and no attempted timestamp. They MUST NOT create a private receipt intent, send a notification or wake an agent. Ordinary comment --notify and non-notifying Unblocked behavior SHALL remain unchanged.

#### Scenario: Decision-needed report
- **WHEN** a worker stores a question
- **THEN** status exposes the unresolved question and original references for an operator, without automatic delivery or answer routing

### Requirement: Informational result and question readers
Synchronous Tasks-owned readers SHALL provide bounded original report/result/baseline/question/delivery data with total/omitted counts. Unavailable/stale state SHALL remain explicit. Reported references and native done/canceled dependencies MUST NOT imply artifact delivery or acceptance.

#### Scenario: Complete subtasks
- **WHEN** all subtasks have completed reports
- **THEN** epic acceptance remains separate and unknown without explicit authoritative evidence

BBP-39 answer routing, BBP-40 artifact delivery and BBP-41 acceptance-role orchestration remain deferred backlog. The earlier installed post-pause failures remain failed evidence; this release does not repair or diagnose them.
