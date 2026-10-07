# codex-usage-live-refresh Specification

## Purpose

Keep the selected host's visible recorded-usage graph current by loading existing collector data into its report index. Keep collection controls, historical imports, and account allowance separate from graph refresh.

## Requirements

### Requirement: Visible graph prepares new recorded usage

For a selected enrolled host with compatible configured history, the plugin SHALL load newly recorded collector events into the report index while the graph page is visible, without requiring history management to be open. After preparation settles, the graph SHALL read the updated index. This SHALL NOT require account quota to be available.

#### Scenario: New usage arrives with management closed

- **WHEN** valid confirmed usage is appended to the existing collector logs while the graph is visible and history management is closed
- **THEN** the next preparation round loads that usage and the graph shows it once, with its original date, token total, and captured price

#### Scenario: Quota is unavailable

- **WHEN** configured history has new collector events but account quota has no usable observation
- **THEN** graph preparation and subsequent graph refresh still run

### Requirement: Visible refresh has an independent lifecycle

The plugin SHALL prepare history on graph activation and start the next normal preparation round 60 seconds after successful settlement. Only one sequential preparation loop SHALL run per visible graph instance. Hiding or unmounting the graph SHALL stop new automatic work. Resume SHALL start at most one due round, without replaying missed timer ticks.

#### Scenario: Graph stays open

- **WHEN** a preparation round settles and the graph remains visible
- **THEN** the next round starts after 60 seconds without a quota read or user action

#### Scenario: Page resumes after suspension

- **WHEN** the graph becomes visible after several refresh intervals were missed
- **THEN** at most one due preparation round starts and stale graph data is not described as current

#### Scenario: Graph is not visible

- **WHEN** the user leaves the graph page, hides its document, or closes the app window
- **THEN** no new graph preparation requests start until the graph is visible again, and no host or server polling service replaces the page owner

### Requirement: Preparation remains bounded and replay-safe

Each preparation request SHALL have fixed ingestion and identity-work limits, retain durable ingestion progress, and expose bounded pending or settled status. Repeated requests SHALL continue unfinished work without rereading unchanged source bodies or duplicating accepted usage. Settlement SHALL require the ingestion and identity work for that round to be settled, not merely an available database.

#### Scenario: Backlog exceeds one request

- **WHEN** existing collector logs contain more events than one preparation request can load
- **THEN** sequential bounded requests advance durable progress until the round settles, without declaring the graph current after only the first batch

#### Scenario: Logs do not change

- **WHEN** another round runs with unchanged collector sources
- **THEN** accepted totals stay unchanged and source bodies are not reread

#### Scenario: Request is retried or the plugin reloads

- **WHEN** already processed events appear again after a retry, reload, or source replay
- **THEN** each accepted usage identity still contributes at most once

### Requirement: Preparation does not change collection or imports

Graph preparation SHALL read only existing plugin-owned collector logs and compatible configured history. It SHALL NOT install, repair, pause, or resume a collector; change collection settings or roots; create missing history; migrate or recover storage; start or resume imports; discover or read transcripts; prune logs; or change retention policy. Existing logical expiry SHALL remain in force.

#### Scenario: Collector is paused

- **WHEN** collection is paused and existing retained collector logs contain unindexed events
- **THEN** preparation can load those existing events without enabling collection or removing pause coverage

#### Scenario: History is missing or incompatible

- **WHEN** history is not configured or storage has an unsafe or unsupported layout
- **THEN** preparation returns unavailable without creating, migrating, recovering, or changing that storage

#### Scenario: Import-only history

- **WHEN** compatible history has retained imported values but no collector logs
- **THEN** the graph remains readable without installing a collector or starting an import

### Requirement: Calendar reads stay read-only

Graph date navigation, metric changes, and explicit chart reads SHALL NOT load collector logs or run history management. Automatic preparation SHALL remain separate from the calendar read. Date navigation SHALL read the retained index; metric changes SHALL remain local. Chart failures SHALL NOT change account allowance or its refresh owner.

#### Scenario: User changes date range or metric

- **WHEN** the user changes dates or switches between Tokens and Estimated cost
- **THEN** the action starts no preparation, import, collector-control, or account request, and metric changes start no history read

#### Scenario: Explicit chart read

- **WHEN** the user requests a chart read without requesting preparation
- **THEN** it reads only the retained report index and does not claim that a recent read time proves recent ingestion

### Requirement: Selection changes reject earlier results

Preparation SHALL use the selected-host enrollment, generation, and cancellation checks before dispatch and before publishing results. A host change SHALL hide earlier-host graph data immediately. Late results from an earlier selection or disposed page SHALL NOT update the graph or restart its loop. Host database work SHALL remain serialized through actual completion.

#### Scenario: Host changes during ingestion

- **WHEN** a preparation request for host A remains pending while the user selects host B
- **THEN** host A's result cannot appear under host B and no queued host A continuation starts

#### Scenario: Page closes during host work

- **WHEN** the page closes after a preparation request was dispatched
- **THEN** its late result cannot publish or restart page work, and cancellation does not let another operation overlap unfinished database work

### Requirement: Pending and failed preparation remain visible

Preparation SHALL keep usable same-selection graph values visible with a preparing state. Stalled, failed, unavailable, or capped continuation SHALL stop safely and provide an explicit retry. Retained values SHALL remain marked incomplete or out of date when appropriate. A successful report read SHALL NOT hide unfinished or failed preparation.

#### Scenario: Preparation stalls

- **WHEN** bounded continuation makes no progress or reaches its failure or request limit
- **THEN** automatic continuation stops, known graph values remain available with a stopped status, and the user can retry preparation

#### Scenario: Read succeeds while preparation fails

- **WHEN** the database returns a readable report but new collector events could not be loaded
- **THEN** the graph does not describe the history as current solely because the report has a new observation time

### Requirement: Recorded-value and privacy rules remain unchanged

Refresh SHALL preserve original accepted timestamps, recorded totals, captured prices, attribution, exclusions, and coverage. It SHALL NOT infer missing usage, reprice records, count replayed usage twice, turn unknown dates into zero, or claim a complete current day. Public results SHALL remain bounded and exclude collector bodies, transcripts, credentials, and raw account responses.

#### Scenario: Current day receives a confirmed record

- **WHEN** a confirmed record with positive tokens and no valid captured price reaches the index
- **THEN** today's token subtotal increases once, its cost remains unpriced, and today remains in progress with partial coverage

#### Scenario: Browser receives preparation results

- **WHEN** preparation advances through collector logs and identity evidence
- **THEN** the browser receives only bounded status and progress, followed by normalized graph values, not the underlying collector records
