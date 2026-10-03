# Task safe dispatch spec delta

## Purpose

Lets an approved epic run reuse or create task-owning BB workers while preventing duplicate orchestration dispatches and preserving recoverable state after partial failures.

## ADDED Requirements

### Requirement: Orchestration-specific eligibility enforcement
Orchestration dispatch SHALL validate the active run, requesting coordinator, approved scope, project membership, task status, current native blockers, required result handoffs, and execution selection before spawning or requesting continuation. It MUST NOT start blocked work with only a warning. Readiness SHALL be rechecked when delayed coordinator-requested work actually begins while the plugin is active. Legacy task dispatch warning behavior SHALL remain unchanged.

#### Scenario: Blocker remains open
- **WHEN** orchestration dispatch targets a task with an unfinished native blocker
- **THEN** it returns the blocking task references without spawning or resuming a worker

#### Scenario: Task becomes blocked while queued
- **WHEN** an eligible orchestration worker is queued by BB and its prerequisite reopens before execution begins
- **THEN** admission rejects the work while the plugin is active and the existing worker/attempt identity remains recoverable

#### Scenario: Outside approved scope
- **WHEN** dispatch names a task added after run approval or changed scope not yet approved
- **THEN** it refuses the work without creating a worker

#### Scenario: Legacy manual command
- **WHEN** the existing non-orchestration dispatch command starts a blocked task
- **THEN** its existing warning behavior is preserved

### Requirement: Existing ownership takes precedence
Dispatch SHALL reuse the task's existing designated owning association without spawning, reseeding, or interrupting the worker. Non-owning attachments MUST NOT be treated as interchangeable owners. Undesignated legacy associations SHALL require explicit adoption. Multiple possible owners, missing owners, and tasks with recorded prior work but no ownership SHALL return a resolution-needed outcome even if their current status is `backlog` or `todo`. Failed or manually stopped owners MUST NOT be automatically replaced.

#### Scenario: Retry against an active owner
- **WHEN** the coordinator repeats dispatch for a task with an active designated owner
- **THEN** the same worker is returned and receives no duplicate seed message

#### Scenario: Undesignated legacy worker
- **WHEN** a task has one attached worker but no ownership designation
- **THEN** dispatch requests adoption of that association instead of creating another worker

#### Scenario: Multiple attached workers
- **WHEN** several attached workers could own the ticket and no primary owner is established
- **THEN** dispatch returns an ownership decision with the candidate references

#### Scenario: In-progress task without worker
- **WHEN** an `in_progress` task has no known owner
- **THEN** dispatch reports unresolved ownership and does not assume the task is untouched

#### Scenario: Earlier work without an attachment
- **WHEN** a `todo` task has recorded agent work or result history but no attached owner
- **THEN** dispatch requests ownership resolution rather than treating the missing attachment as proof that the task is untouched

### Requirement: Recoverable child creation
New orchestration workers SHALL be created in the linked BB project, parented to the coordinator, correlated with their task and attempt from creation time, and attached through Tasks. Successful local attachment and ticket-status changes SHALL commit together. Partial failure MUST preserve enough attempt state to find and attach the original worker. The system MUST NOT claim that BB creation and Tasks attachment are one atomic transaction or delete a potentially working child as automatic compensation.

#### Scenario: Successful child creation
- **WHEN** a valid unowned task is dispatched
- **THEN** one child worker is created with the selected execution/environment settings and its Tasks association identifies its role

#### Scenario: Attachment fails after creation
- **WHEN** BB creates the child but the Tasks attachment commit fails
- **THEN** the original attempt remains recoverable and retry attaches the discovered child without spawning or reseeding another worker

### Requirement: Durable duplicate prevention
Concurrent dispatches and retries for the same unresolved task/role SHALL share one durable claim across runs and plugin restarts. Repeating a completed attempt SHALL return the associated worker. A lost response, timeout, failed reconciliation, zero observed matches after ambiguous creation, or multiple matches MUST NOT automatically clear the claim or cause another spawn. Definite failure SHALL become retryable only when the observed BB contract establishes that no worker exists.

#### Scenario: Concurrent requests
- **WHEN** two orchestration requests dispatch the same unowned task/role concurrently
- **THEN** at most one request invokes creation and the other observes that attempt

#### Scenario: Lost creation response
- **WHEN** the creation response is lost and reconciliation cannot yet identify a worker
- **THEN** dispatch remains unresolved and a retry does not invoke creation again

#### Scenario: Restart after ambiguous creation
- **WHEN** the plugin restarts with an unresolved creation claim
- **THEN** the claim survives and plugin startup does not spawn or resume work

### Requirement: Explicit recovery and replacement
Recovery SHALL prefer a discovered original worker over a proposed replacement. Linking a known worker SHALL validate project, task, role, and run context. Releasing an unresolved claim or replacing an owner SHALL require explicit user resolution after a fresh reconciliation, preserve relevant history, and warn about delayed-creation duplicate risk. Resolution itself MUST NOT spawn, resume, or delete workers. A new dispatch requires a separate operation under current authorization.

#### Scenario: Recovery finds the original
- **WHEN** an operator resolves a claim and the latest reconciliation finds its original child
- **THEN** that child is linked and no replacement is created

#### Scenario: Unsafe resolution
- **WHEN** reconciliation fails, the claim is still being created, or the proposed worker belongs to another project
- **THEN** the resolution is refused and the claim remains intact

### Requirement: BB owns execution scheduling
The orchestration module SHALL use existing presets, environment providers, BB dispatch queues, and installed concurrency policies. It MUST NOT introduce another capacity scheduler or use repeated agent status polling to allocate slots.

#### Scenario: Capacity exhausted
- **WHEN** BB's existing concurrency policy delays an approved worker
- **THEN** the coordinator sees its pending activity and retains its owning association rather than creating a replacement or scheduling through another queue
