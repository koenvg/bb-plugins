# Task safe dispatch spec delta

## Purpose

Retain ownership/claim history and explicit bookkeeping recovery. All orchestrator execution is deferred in the approved manual-first release.

## ADDED Requirements

### Requirement: Deferred execution before side effects
Every new orchestrator dispatch/adoption/continuation/retry entrypoint SHALL return a clear manual-first deferred outcome before eligibility execution, seed preparation, claim creation, worker creation or agent input. No CLI/RPC/tool/startup/reload/event/skill path MAY spawn, send, queue, recheck, continue or wake an agent. Strict input parsing MAY reject invalid requests without execution.

#### Scenario: Approved dispatch
- **WHEN** a valid dispatch is requested within approved scope
- **THEN** it returns deferred with null thread/claim, preserves task/run state and creates no worker or claim

#### Scenario: Historical dispatch retry
- **WHEN** an earlier attempt has a known, unknown or detached owner
- **THEN** retry preserves that history and returns deferred without new execution or fabricated resolution

### Requirement: Preserve ordinary Tasks
Existing operator-led Tasks delegation, manual attachments, warning-only legacy dependency dispatch and comment --notify targeting SHALL remain unchanged. The orchestrator skill MUST NOT use these controls as substitute automation.

#### Scenario: Operator-led ordinary command
- **WHEN** the operator deliberately uses the existing Tasks worker control
- **THEN** its existing behavior remains separate from scope records and deferred orchestrator execution

### Requirement: Bookkeeping-only recovery
Recovery SHALL prefer the original child, validate project/task/role/run context and preserve live/released history. Fresh reconciliation and explicit operator resolution SHALL remain required for claim release/replacement. Recovery MUST NOT automatically spawn, seed, send, resume, stop, delete or replace a native child.

#### Scenario: Known original worker
- **WHEN** bookkeeping reconciliation identifies the original child
- **THEN** only the approved local record attachment can occur, with original history retained and no native input

### Requirement: No new scheduling or replay
Startup/reload/enable SHALL retain historical records without draining queues, replaying reports, creating claims or resuming workers. Scope pause MUST NOT be represented as native cancellation. Accepted native work requires separate approved inspection and resolution before guard unload.

#### Scenario: Reload after uncertain creation
- **WHEN** a historical claim has uncertain native creation
- **THEN** that claim remains recorded and no automatic execution or replacement occurs
