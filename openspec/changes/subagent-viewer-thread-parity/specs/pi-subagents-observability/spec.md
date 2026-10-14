# Spec Delta

## ADDED Requirements

### Requirement: Thread-style captured conversation

The Subagents panel SHALL place the run list above the selected conversation and present the captured task, messages, and final output with the normal thread reading treatment. Tool calls and results SHALL start collapsed and expand on user action. The viewer SHALL preserve foreground, background, workflow, and nested child identity and SHALL NOT create BB threads to display captures.

#### Scenario: Read a captured child

- **WHEN** the user selects a child with captured task, assistant text, tools, and final output
- **THEN** prose uses normal thread Markdown typography, spacing, and code treatment rather than a raw monospace transcript
- **AND** task attribution, message roles, tool records, and final output remain distinct and in captured order
- **AND** expanding a tool shows escaped detail without running the tool

#### Scenario: View a nested or foreground child

- **WHEN** the captured inventory contains foreground children and nested workflow children
- **THEN** each remains selectable under its owning identity without being flattened into an unrelated run
- **AND** the viewer does not invent an agent role, task attribution, or message that was not captured

### Requirement: Prominent truthful run metadata

Each selectable run and its selected detail SHALL expose execution state, captured resolved model when available, and known elapsed or total duration. Running time SHALL identify its observation basis rather than imply a live clock. Missing model or duration SHALL be explicitly unavailable. A parent model, requested alias, workflow container, or tool duration SHALL NOT substitute for a child's resolved model or run duration.

#### Scenario: Child model differs from parent model

- **WHEN** attributed child assistant records identify a resolved provider and model different from the parent's selection
- **THEN** the viewer displays the child record's model and provider
- **AND** the metadata identifies it as captured information rather than a promise about current execution

#### Scenario: Legacy or background capture lacks a model

- **WHEN** an old capture or the compatible background protocol supplies no resolved child model
- **THEN** the run list and selected detail show model unavailability
- **AND** neither borrows a parent, sibling, configured, or requested model value

#### Scenario: Running and terminal timing

- **WHEN** a run has supported duration or start/end/observation timestamps
- **THEN** terminal detail identifies total duration and nonterminal detail identifies elapsed time at observation
- **AND** a run without sufficient timing data displays duration unavailability instead of zero

### Requirement: Capture limits remain visible

The viewer SHALL distinguish execution outcome from capture availability and retain accepted content when a later read or capture fails. It SHALL expose observation time, successful capture time, failed-attempt time when present, omission counts, and clipped task, message, or output notices. Missing final output SHALL NOT change the known execution outcome or imply a complete transcript.

#### Scenario: Completed execution has incomplete capture

- **WHEN** a completed child lacks final output or some transcript entries
- **THEN** the execution remains displayed as complete and capture incompleteness is explained separately
- **AND** omitted-entry and clipped-text notices remain reachable with the captured content
- **AND** final-output navigation is unavailable if no final output was captured

#### Scenario: Capture fails after an accepted result

- **WHEN** a newer capture attempt times out, is stale, is unsupported, or fails
- **THEN** the previous accepted task, transcript, and result remain readable under the same child identity
- **AND** the original capture time and newer failed-attempt information remain distinct

#### Scenario: Loading, empty, and history-read failure

- **WHEN** the panel is loading, has no captured children, or cannot read history
- **THEN** it shows the corresponding state without claiming running work or successful capture
- **AND** a history failure retains any accepted content already available for that thread

### Requirement: Reading state survives current-run actions

Selecting the current run again SHALL preserve transcript reading position and open tool details. An ordinary history refresh with unchanged conversation content SHALL preserve those states and focus. Selecting a different run SHALL show that run's conversation. A final-output action SHALL move reading focus to captured final output without changing selection or execution.

#### Scenario: Reselect the current run

- **WHEN** the user has scrolled the transcript and opened a tool, then selects the same run again
- **THEN** the reading position and open tool remain unchanged
- **AND** the selected run remains accurately exposed to assistive technology

#### Scenario: Refresh changes metadata only

- **WHEN** an automatic history refresh changes observation metadata but not the selected conversation
- **THEN** it does not reset scroll position, close tools, or steal keyboard focus

#### Scenario: Jump to captured final output

- **WHEN** the user activates final-output navigation for a run with captured output
- **THEN** the output becomes reachable and receives reading focus
- **AND** the action neither starts a turn nor changes the selected child

### Requirement: Adaptive accessible viewer layout

The viewer SHALL inherit the active BB theme, expose visible keyboard focus, and support pointer, Enter, Space, ArrowUp, ArrowDown, Home, and End selection. Disclosure arrows and accessible state SHALL match expansion. The transcript SHALL retain a minimum 200 CSS-pixel reading area, with outer scrolling when needed. Narrow layout and enlarged text SHALL not cause page overflow; coarse-pointer targets SHALL be at least 44 pixels with primary text at least 16 pixels.

#### Scenario: Narrow or short panel with enlarged text

- **WHEN** the panel is 320 pixels wide, short, or uses 200-percent text size
- **THEN** controls and metadata wrap without horizontal page overflow
- **AND** outer scrolling keeps headers, notices, capture details, and the transcript reachable
- **AND** wide code or tool content contains its own overflow rather than widening the panel

#### Scenario: Keyboard and reduced-motion use

- **WHEN** the user selects runs and operates disclosures by keyboard with reduced motion enabled
- **THEN** selection remains visible, all reading controls remain reachable, and arrow orientation matches disclosure state
- **AND** state and progress do not depend on animation

#### Scenario: Coarse-pointer use

- **WHEN** the input device reports a coarse pointer
- **THEN** run selectors, disclosures, and final-output controls provide at least 44-pixel targets
- **AND** primary reading text and controls remain at least 16 pixels without obscuring metadata or notices

### Requirement: Compatible bounded capture enrichment

New model and tool metadata SHALL be optional and bounded so existing stored captures remain readable. Model values SHALL come only from supported, attributed child records. Tool names and error flags SHALL be retained when the supported source provides them. Normalization SHALL preserve block order and report omissions after enforcing the capture budget. Foreign, unmatched, malformed, or unsupported inputs SHALL NOT supply metadata to another child.

#### Scenario: Restore an old capture

- **WHEN** stored version-1 history contains no new model or tool metadata
- **THEN** the capture restores without migration or another child execution
- **AND** missing fields remain unavailable while existing content and truncation information stay readable

#### Scenario: Preserve structured tools

- **WHEN** supported inspection records include a tool name or error flag, or a foreground message contains mixed text and tool blocks
- **THEN** the viewer retains supported metadata and distinguishes tool records from prose in source order
- **AND** it does not guess call/result pairing or individual tool duration
- **AND** entries omitted by the bounded display receive an explicit omission count

#### Scenario: Reject unrelated metadata

- **WHEN** an inspection reply has the wrong request, run, child, or session identity, or exceeds a supported boundary
- **THEN** it cannot overwrite accepted model, tool, or conversation data for the selected child
- **AND** the viewer retains an explicit unavailable or stale condition

### Requirement: Read-only viewer preserves native work

Viewer selection, refresh, disclosure, and output navigation SHALL NOT launch, stop, message, steer, resume, or relaunch a child or open a parent model turn. The panel SHALL preserve existing single-root and overview navigation semantics, parent drafts, native activity accounting, and completion delivery. No additional composer indicator or execution control SHALL be introduced.

#### Scenario: Open a matched root or overview

- **WHEN** the existing native composer shortcut opens a validated root or aggregate overview
- **THEN** the new layout preserves that requested target, or overview without automatic run selection
- **AND** invalid or missing targets remain explicit rather than selecting another run as the requested detail

#### Scenario: Inspect while the parent is idle

- **WHEN** the user reads a child after the parent turn has closed
- **THEN** reading and refresh do not change parent turn boundaries, the unsent draft, or native background-work accounting
- **AND** viewer actions do not alter how Pi settles or delivers child completion
