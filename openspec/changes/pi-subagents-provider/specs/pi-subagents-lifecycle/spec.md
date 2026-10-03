# Spec Delta

## Purpose

Keep Pi background work represented as native BB activity so an idle main-agent turn does not cause premature session cleanup or lost child completion delivery.

## ADDED Requirements

### Requirement: Native background activity while work is live

The fork SHALL represent live background subagent work through BB's native background-task mechanism, not only a frontend indicator. The thread SHALL show background-agent activity and remain protected from idle-session cleanup while any represented execution or descendant remains live. The main agent SHALL retain its normal turn boundaries. The integration SHALL NOT create BB child threads or claim that Pi children consume separate BB child-agent concurrency slots.

#### Scenario: Parent becomes idle while child continues
- **WHEN** the parent finishes its turn and a background child remains live beyond BB's configured idle-session cleanup interval
- **THEN** native background activity remains present and BB does not release that child's parent Pi session through idle cleanup

#### Scenario: Last child completes
- **WHEN** all represented work has authoritative terminal outcomes
- **THEN** native background activity clears without requiring a fabricated final main-agent turn

#### Scenario: Workflow root settles before a descendant
- **WHEN** a workflow root is terminal but a descendant remains live
- **THEN** the thread retains background activity until the live descendant also settles

### Requirement: Reconcile execution state without guessing from silence

The fork SHALL reconcile run identity and lifecycle from compatible authoritative package data. Duplicate updates SHALL be idempotent. Widget clearing, missing entries from truncated snapshots, stale timestamps, or absence of event traffic SHALL NOT alone establish success, failure, or completion. Paused and partial records SHALL be classified by whether execution or descendants remain live.

#### Scenario: Quiet tool call produces no new events
- **WHEN** a live child remains in a long tool call without recent progress messages
- **THEN** the fork does not mark that child terminal merely because activity is old

#### Scenario: A bounded snapshot omits an observed run
- **WHEN** a snapshot reports omitted runs or children and no longer lists previously live work
- **THEN** that omission does not clear native activity without authoritative reconciliation

#### Scenario: Completion arrives twice
- **WHEN** equivalent terminal receipts arrive through multiple observation paths
- **THEN** the represented work settles once and no duplicate execution or negative activity count is produced

### Requirement: Child results reach the owning parent

The fork SHALL preserve Pi's existing completion-notification path so completed child work can reach and, where Pi requests it, wake the originating parent session after the parent turn becomes idle. Observation and inspection SHALL NOT substitute their own model prompt, consume the result as a notification acknowledgement, or deliver it to another thread. Inspection failure SHALL NOT prevent normal completion delivery.

#### Scenario: Child completion requests a parent wake
- **WHEN** a background child completes after its parent becomes idle and Pi requests a completion turn
- **THEN** the same parent receives the completion and continues through its normal Pi session

#### Scenario: Another Pi thread is active
- **WHEN** a child from one fork-provider thread completes while another thread is active
- **THEN** its completion and captured result remain associated with the originating thread only

#### Scenario: Inspection fails during completion
- **WHEN** the child completes but its result-detail capture fails
- **THEN** Pi's normal parent completion delivery still occurs and native activity does not remain open solely for failed inspection

### Requirement: Explicit interruption and safe recovery

On process loss, explicit session release, or replacement, the fork SHALL retain interrupted or unknown observation evidence rather than report unproved success. A resumed session SHALL reconcile surviving package state without spawning, steering, resuming, or stopping children as an observation side effect. The fork SHALL NOT claim uninterrupted survival across provider disable, machine shutdown, or deleted canonical artifacts.

#### Scenario: Parent Pi process exits unexpectedly
- **WHEN** the parent process exits before observed background work has a confirmed outcome
- **THEN** the view and activity reconciliation identify the interruption or uncertainty rather than label that work successful

#### Scenario: Session resumes with surviving run artifacts
- **WHEN** the fork resumes the owning Pi session and compatible canonical state remains available
- **THEN** it reconstructs observation state from that evidence without launching a replacement child

### Requirement: Installed lifecycle proof before release

Lifecycle acceptance SHALL include an installed test on the declared compatible BB, Pi, and subagent versions. The test SHALL establish the cleanup interval, observe the parent idle, keep bounded child work live beyond that interval, and observe its completion reaching the parent. Required checks SHALL be reported as passed, failed, or blocked; a badge, fake protocol test, or short run SHALL NOT alone satisfy this requirement.

#### Scenario: Live test proves retention and wake
- **WHEN** the bounded installed test passes the actual idle cleanup deadline and the child result reaches its parent
- **THEN** the acceptance report records both retention and completion evidence with the tested versions

#### Scenario: Live prerequisites are unavailable
- **WHEN** the test cannot establish the cleanup deadline, run approved child work, or observe completion delivery
- **THEN** lifecycle acceptance remains blocked and the fork is not presented as having passed that gate
