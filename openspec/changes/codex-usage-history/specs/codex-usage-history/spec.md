# Spec delta

## Purpose

Collect and recover compact Codex usage on an explicitly selected host, attributing records to verified threads or workspaces without treating incomplete evidence as exact cost ownership.

## ADDED Requirements

### Requirement: Explicit selected-host collector controls
The plugin SHALL show collector installation/version status and provide explicit install, repair, pause, and resume actions on the selected enrolled host. It SHALL NOT install or repair the collector during plugin activation, quota refresh, or dashboard loading. Installation SHALL affect only the plugin's own extension and storage, preserve other Pi extensions, establish an immutable initial observation boundary, and explain that already-running Pi sessions need restarting to load a new collector. Repair SHALL preserve existing events and coverage boundaries. Pause intervals and inactive or unconfirmed writers SHALL NOT be represented as complete observed coverage. The UI SHALL explain that an installed Pi extension has a lifecycle separate from the BB plugin and can keep collecting when the BB UI is closed or the BB plugin is disabled.

#### Scenario: Open a quota-only installation
- **WHEN** the dashboard opens on a host without a collector
- **THEN** collector status is missing and no extension or history file is installed or imported

#### Scenario: Repair the collector
- **WHEN** the user repairs an outdated collector
- **THEN** only this plugin's extension is replaced, existing events and the original observation boundary remain intact, and the view identifies sessions that need restarting

#### Scenario: Pause and resume
- **WHEN** the user pauses collection and later resumes it
- **THEN** new usage is not logged during the pause and the paused interval remains a disclosed coverage gap

### Requirement: Compact private usage records
The collector SHALL record only validated scalar usage metadata for Pi assistant messages from `openai-codex`: stable usage identity, original timestamp, Pi session identity, available BB context, actual workspace path, provider/model, token classes, total tokens, and valid captured estimated cost or missing-price state. Events and indexes SHALL use plugin-owned storage on the owning host, isolated from OpenForge and BB core storage. Prompts, assistant text, tool arguments/results, credentials, authentication claim IDs, raw upstream responses, and arbitrary errors SHALL NOT be persisted or returned by this subsystem. The browser SHALL receive only bounded aggregates, display metadata, and fixed diagnostics, not raw session/event logs.

#### Scenario: Assistant message includes tool data and credentials
- **WHEN** an assistant usage event or imported transcript entry contains message/tool content alongside usage
- **THEN** only allowed scalar usage metadata reaches collector storage, indexes, logs, and public results

#### Scenario: Non-Codex message
- **WHEN** a Pi assistant message uses a provider other than `openai-codex`
- **THEN** it contributes no Codex usage event

### Requirement: Evidence-based thread and workspace attribution
The plugin SHALL prefer validated exact BB thread context or a unique verified BB provider-session binding for thread attribution. It SHALL consider all relevant identity changes, not only a thread's latest identity, and distinguish BB provider identity from the Pi session ID. Without exact evidence, it SHALL use host plus normalized actual workspace path for workspace-only attribution. Path matching SHALL use full path equality with filesystem alias handling where verifiable, never basenames, substring/prefix matches, or timestamp proximity. A path shared by several threads SHALL remain workspace usage without guessed splitting or duplication. Records with conflicting evidence SHALL be marked ambiguous and excluded from exact-thread totals. Unavailable paths and absent identities SHALL be disclosed rather than guessed. Historical workspace ownership SHALL not silently change when a thread moves, is archived, or is deleted.

#### Scenario: Verified provider identity differs from Pi session ID
- **WHEN** a BB thread identity uniquely resolves a transcript whose header contains a different Pi session ID
- **THEN** the verified relationship supports exact-thread attribution without assuming the two IDs are equal

#### Scenario: Thread changes provider identity
- **WHEN** a thread has accepted usage under two verified provider identities
- **THEN** both contribute to that thread exactly once while preserving their original workspace records

#### Scenario: Two threads share one workspace
- **WHEN** usage has a known workspace but no exact thread binding and two BB threads use that workspace
- **THEN** it appears once in the workspace subtotal and in neither exact-thread subtotal

#### Scenario: Identical path on different hosts
- **WHEN** two enrolled hosts have the same absolute workspace path
- **THEN** their usage remains separate and changing host selection cannot merge them

#### Scenario: Workspace changes after capture
- **WHEN** a thread moves to another workspace after usage was captured
- **THEN** earlier usage retains its recorded workspace and any verified thread binding instead of being reassigned to the thread's new path

### Requirement: Bounded incremental ingestion and replay safety
The history subsystem SHALL ingest compact collector logs incrementally with durable progress, bounded work per cycle, and explicit backlog/invalid-record diagnostics. Unchanged sources SHALL require no body read. Replayed sources, reloads, retries, and confirmed live/import overlap SHALL NOT duplicate accepted usage. Historical branching SHALL NOT count copied ancestor messages as new expenditure. Unresolved identity or overlap SHALL remain visible as incomplete and SHALL NOT contribute potentially duplicated numeric totals until resolved; equal timestamps, token totals, or cost values alone SHALL NOT prove duplication or identity.

#### Scenario: Reload with unchanged logs
- **WHEN** the plugin reloads and collector sources are unchanged
- **THEN** indexed totals remain the same and reconciliation does not reread unchanged source bodies

#### Scenario: Confirmed overlapping import and collection
- **WHEN** the same persisted assistant message appears in collector data and an explicit historical import
- **THEN** the record contributes once through shared identity evidence

#### Scenario: Copied fork ancestry
- **WHEN** an imported branched session contains ancestor messages already recorded in its source session
- **THEN** copied ancestry is not charged as fresh usage and unresolved ancestry is disclosed instead of counted twice

### Requirement: User-started bounded historical import
Historical transcript discovery and body reads SHALL occur only within a user-started import generation. Import SHALL target the selected host's BB Pi sessions and explicitly configured retained Pi session locations associated with known workspace scopes, not arbitrary filesystem-wide scans. Imports SHALL persist their frozen time range, candidate/read progress, counts, and bounded diagnostics; support explicit resume/cancel; and be idempotent across retries and reloads. New imports SHALL not run automatically on startup or account/history refresh. Live ingestion SHALL remain available independently. Missing transcripts, absent workspace evidence, replaced files, oversize records, parsing failures, and unresolved identities SHALL produce explicit omissions or incomplete coverage. Cancellation and host-selection changes SHALL not expose an old host's results under a new selection.

#### Scenario: Ordinary history read
- **WHEN** the user opens the history report or changes its dates without starting an import
- **THEN** the subsystem reads its compact index and collector logs as needed without discovering or reading transcripts

#### Scenario: Import interrupted by reload
- **WHEN** a running import is interrupted by a plugin/host-worker reload
- **THEN** durable progress remains available and work resumes only after an explicit resume action

#### Scenario: Missing workspace or replaced file
- **WHEN** an import candidate has no trustworthy workspace evidence or changes file identity during a ranged read
- **THEN** affected records are omitted or quarantined with a fixed diagnostic and the range is not labeled complete

### Requirement: Honest coverage, retention, and recovery
The plugin SHALL distinguish observed, imported, uncovered, incomplete, stale, empty, and unavailable history. A collector installation timestamp alone SHALL NOT prove complete coverage of earlier or already-running sessions. Detailed events and collector logs SHALL be retained for 45 days; compact records sufficient to reconstruct local-day token and captured-cost reports SHALL be retained for three calendar months plus seven rolling support dates and a two-day timezone margin. Expired records SHALL not become zero activity or be resurrected by routine replay. Storage recovery SHALL preserve a newer unsupported schema untouched, quarantine only confirmed corrupt plugin-owned storage, rebuild only from retained sources, and disclose unrecoverable intervals. Required storage support missing on a host SHALL make history unavailable without disabling quota.

#### Scenario: Covered empty interval versus uncovered interval
- **WHEN** one interval is fully covered with no accepted events and another has no reliable coverage
- **THEN** the first is observed inactivity and the second is unknown, not zero

#### Scenario: Detailed rows expire
- **WHEN** detailed event retention expires while compact history remains retained
- **THEN** retained daily token/cost values remain reconstructible, unavailable detailed breakdowns are identified, and older expired history is not fabricated

#### Scenario: Corrupt database recovery
- **WHEN** corruption is confirmed and retained collector logs cannot cover all previously indexed dates
- **THEN** recovery preserves safe retained totals and marks the lost intervals incomplete rather than claiming full reconstruction

#### Scenario: Unsupported newer schema
- **WHEN** the installed plugin finds a database created by a newer schema version
- **THEN** it leaves the database unchanged and reports history unavailable while quota continues working
