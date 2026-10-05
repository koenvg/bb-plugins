# BB Orchestrator spec delta

## Purpose

Manage manually approved scope records and summarize an existing Tasks epic. The approved manual-first contract supersedes automated coordination for the first release.

## ADDED Requirements

### Requirement: Bundled manual-only record skill
Tasks-plus SHALL bundle bb-orchestrator with heading BB Orchestrator and manual-only metadata. The skill SHALL use only scope controls and status reads. It MUST NOT issue agent input or route around deferred automation through ordinary Tasks dispatch, comment notification or thread APIs. Install, enable, reload, discovery and automatic consideration MUST NOT start a scope run or worker.

#### Scenario: Deferred operation
- **WHEN** a coordinator needs a worker start, answer, handoff or integration assignment
- **THEN** the skill returns the need for a deliberate operator action, not an alternative execution command

### Requirement: Native-approved scope records
Begin/resume SHALL validate an exact persisted explicit invocation and actual native submitted approval using the retained verified provider contract. Chat agreement and old consent MUST NOT substitute for a submitted form. The temporary BBP-51 user/null boundary is not independent human-identity proof. Unsupported, stale, mixed, quoted, cross-thread and observed system/agent input SHALL refuse scope control.

#### Scenario: Scope approval
- **WHEN** the native decision approves existing epic/subtask scope, recorded preset and baseline
- **THEN** one scope record is stored, duplicate requests reuse it, and no worker input or claim is created

### Requirement: Scope pause is not native cancellation
Scope pause SHALL update only the scope record. It MUST NOT stop a worker, cancel a queue or claim to revoke accepted native work. Reload SHALL read prior active scope as interrupted without resuming workers. Restricted actions and scope additions SHALL retain separate approval.

#### Scenario: Scope pause with an existing worker
- **WHEN** the operator pauses scope
- **THEN** the record becomes paused and the worker/native queue remains unchanged

### Requirement: Readable scope-record approval
The Tasks-owned renderer SHALL show selected scope, coordinator, recorded execution selection, permissions and baseline intent. Full-access text SHALL state that no worker starts or receives input. Restricted operations still need separate approval. Technical details SHALL retain complete identities, fingerprints, scope text and editable parameters. Labels SHALL be escaped, display-only values and SHALL fall back to exact bound IDs on stale or unavailable metadata. Both server and browser SHALL use the same complete canonical tracker fields. Approval SHALL submit the exact bound proposal. Approve scope, Resume scope and Cancel SHALL remain keyboard-accessible outside technical details at narrow widths. Changed parameters SHALL clear approval readiness until checked again.

### Requirement: Coordination and acceptance stay separate
The coordinator SHALL summarize records and operator decisions only. It MUST NOT inspect repositories/transcripts, implement, test, review, integrate or diagnose. Epic success SHALL require separate explicit integration evidence; done subtasks and idle workers MUST NOT imply acceptance.

#### Scenario: Worker failure
- **WHEN** a report records failure
- **THEN** the failure and references remain visible without automatic worker wakeup, diagnosis assignment or acceptance

Automated dispatch, answer routing, artifact delivery and integration/acceptance-role execution are deferred, not release acceptance requirements or delivered capabilities.
