# pi-subagents-observability Specification

## Purpose

Let users view Pi child progress and captured results inside BB through bounded, structured, read-only observations of foreground and background delegation.

## Requirements

### Requirement: Native composer bar opens captured background detail

The fork SHALL make a matched existing native background-agent composer bar open Subagents in the same thread. A single-run bar SHALL select its validated background root. Aggregate and narrow bars SHALL open an overview without automatically selecting a run, including before first expansion. Pointer, Enter, and Space activation SHALL work. Activation SHALL leave the parent chat and draft intact and SHALL NOT start an agent turn or control child execution.

#### Scenario: User clicks a single-run bar

- **WHEN** the native bar above the composer matches a captured background root belonging to the current thread
- **THEN** clicking the existing bar opens that root's detail in Subagents
- **AND** the parent chat and unsent draft remain unchanged without any model request or child-management action

#### Scenario: User activates the bar by keyboard

- **WHEN** the matched native bar receives keyboard focus and the user presses Enter or Space
- **THEN** the panel opens once with the same target as pointer activation
- **AND** Space does not scroll the page instead of activating the shortcut

#### Scenario: User activates an aggregate or narrow bar

- **WHEN** a recognized native agent-only aggregate or narrow bar belongs to this provider's current thread context
- **THEN** activation opens the Subagents overview without automatically selecting a run
- **AND** all captured roots remain selectable, even when the native disclosure has not yet exposed run IDs
- **AND** the native expand/collapse behavior remains available

#### Scenario: Same target is opened again

- **WHEN** the user activates the bar again for the same background root or overview
- **THEN** the existing tab is focused instead of creating another tab with the same target

#### Scenario: Requested detail is no longer available

- **WHEN** the panel's completed history read cannot find the requested background root
- **THEN** it reports that the requested detail is unavailable and retains access to other captured rows
- **AND** it does not relaunch the run or describe a different root as the requested one

#### Scenario: Host refuses panel navigation

- **WHEN** the host declines a panel-open request
- **THEN** the native bar and manual Subagents entry remain usable
- **AND** the plugin reports the failure without adding another composer bar, automatically retrying, or navigating away from the parent chat

### Requirement: No duplicate composer UI or unrelated native changes

The workaround SHALL add no visible composer bar, banner, button, or replacement indicator. It SHALL preserve native text, timing, layout, expand/collapse behavior, and activity accounting apart from the intended navigation and focus affordances. It SHALL leave transcript indicators and unrelated native work untouched. Native turn boundaries, capture, and completion delivery SHALL remain unchanged.

#### Scenario: Background work is displayed

- **WHEN** a matched native background-agent composer bar is present
- **THEN** that existing bar provides navigation without a second visible bar or button
- **AND** its native progress text and timing remain intact

#### Scenario: User clicks the transcript indicator or a background command

- **WHEN** the user activates a transcript background-agent indicator, a command-only bar, or an unmatched mixed-work bar
- **THEN** the workaround does not intercept that element or change its behavior

#### Scenario: Native work settles

- **WHEN** BB removes or changes its native background bar after authoritative settlement
- **THEN** the workaround follows BB's existing presentation rather than retaining or inventing an activity indicator
- **AND** completed captures remain accessible through the manual Subagents entry

### Requirement: Bounded content-script compatibility and cleanup

The workaround SHALL attach only to a recognized composer DOM shape with ownership confirmed from the current thread's SDK provider context and validated background observations. Missing, ambiguous, unsupported, or changed structure SHALL leave the native element untouched. Teardown and lost matches SHALL remove plugin-owned listeners, observers, and decorations. Thread changes SHALL invalidate earlier bindings and pending replies. The manual Subagents entry SHALL remain available.

#### Scenario: BB changes the native DOM shape

- **WHEN** the existing bar no longer matches a tested supported structure or its ownership cannot be confirmed
- **THEN** the workaround leaves it unchanged and manual Subagents access still works
- **AND** the plugin does not compensate with another visible bar or broad page-text matching

#### Scenario: User changes threads during a history read

- **WHEN** the user changes threads while an earlier history request is pending
- **THEN** earlier replies and bindings cannot enable navigation to the old thread's root from the new thread

#### Scenario: BB replaces the native bar while work continues

- **WHEN** BB rerenders the matched bar during the same background run
- **THEN** the replacement can receive one matching navigation binding without duplicate activation
- **AND** the removed element no longer retains plugin navigation

#### Scenario: Plugin is disabled or its frontend is replaced

- **WHEN** the plugin's content script or thread navigation context is disposed
- **THEN** it removes its event handlers, observer, and owned styling/accessibility changes
- **AND** the existing native bar returns to its original behavior without replacing or hiding it

### Requirement: Visible child progress

The fork SHALL show foreground and background subagent work with stable child identity, task or label, execution state, elapsed time, and available current activity. Workflow and nested children SHALL appear under their owning run. Fields unavailable from the compatible protocol SHALL remain explicitly unavailable rather than be invented.

#### Scenario: A foreground child runs

- **WHEN** a foreground delegation sends structured progress updates
- **THEN** the view updates the same child entry rather than creating a new child for each update

#### Scenario: Several background workflow children run

- **WHEN** a workflow reports distinct child identities and states
- **THEN** the view shows each child under the workflow with its reported state and activity

### Requirement: Read-only task and result inspection

The view SHALL let the user select a child and read its captured task, bounded recent transcript, and available final output. It SHALL show capture time and distinguish execution state from inspection availability. Inspection SHALL NOT start a model turn or create a visible user prompt. The view SHALL NOT expose launch, stop, message, steer, or resume controls.

#### Scenario: A completed child has captured output

- **WHEN** the user opens that child's details
- **THEN** the view shows the captured final result and execution outcome without starting an agent turn

#### Scenario: An inspection request cannot run

- **WHEN** the inspection command is absent, the artifact is stale, or the reply times out
- **THEN** the view reports the specific unavailable condition and preserves the last captured detail without changing the child's known execution outcome

#### Scenario: Task attribution is unavailable

- **WHEN** the package does not attribute an original task to a forked child
- **THEN** the view identifies that field as unavailable rather than showing the parent's task as the child's task

### Requirement: Bounded and session-scoped observation

The fork SHALL validate supported protocol versions and current-session ownership before accepting observations. It SHALL enforce payload, string, nesting, and row limits; ignore unknown fields within a supported version; and display explicit truncation or omitted-entry counts. Unmatched, late, or foreign-session inspection replies SHALL NOT update the current view. Arbitrary artifact filesystem paths SHALL NOT be exposed as an inspection fallback.

#### Scenario: A reply belongs to an earlier session

- **WHEN** a session is replaced and an inspection reply from the old session arrives
- **THEN** the reply is discarded and cannot overwrite the new session's child detail

#### Scenario: Output exceeds the display budget

- **WHEN** a child produces more output than the capture budget permits
- **THEN** the view displays the captured portion with an explicit truncation marker and does not claim a complete transcript

#### Scenario: A snapshot uses an unsupported version

- **WHEN** a widget payload has a protocol version the fork does not support
- **THEN** the fork reports observation incompatibility without treating the payload as valid progress or success

### Requirement: Captured results remain readable after browser refresh

Accepted result captures SHALL remain associated with their BB thread history. A browser reload SHALL restore the captured bounded detail without requiring the child to run again. Missing or expired data SHALL be reported as unavailable rather than fabricated.

#### Scenario: User reloads after completion

- **WHEN** a child result has been captured and the user refreshes the BB page
- **THEN** that result remains readable from the same thread without another child execution

#### Scenario: Canonical artifacts disappear before capture

- **WHEN** Pi's result artifacts are unavailable before the fork captures the final output
- **THEN** the view preserves the known execution outcome and states that the final output was not captured

### Requirement: Native and accessible presentation

The view SHALL use the active BB theme, provide keyboard-accessible child selection, allow output and errors to wrap, and provide distinct loading, empty, unavailable, running, and terminal states. Animated progress SHALL respect reduced-motion settings.

#### Scenario: No child work has been observed

- **WHEN** the user opens the Subagents panel before any supported delegation
- **THEN** the panel displays an empty state rather than a running indicator or an error

#### Scenario: Keyboard and reduced-motion use

- **WHEN** the user navigates the run tree by keyboard with reduced motion enabled
- **THEN** child details remain reachable and progress does not depend on animation

### Requirement: Thread-style captured conversation

The Subagents panel SHALL default to a full-height Agents overview. Selecting a captured row SHALL open or reactivate a uniquely identified agent tab without reordering an existing tab. Agents SHALL remain pinned while open agent tabs scroll horizontally at the same height without a reserved scrollbar gutter. Available detail readers SHALL remain mounted but hidden and inaccessible to keyboard navigation when inactive. Closing a view SHALL NOT stop execution, delete captured history, or submit a parent turn. Closing the active view SHALL select the preceding open tab, or Agents when no preceding agent tab remains. A tab whose row leaves bounded captured history SHALL release captured content and retain only an ID-based unavailable view.

The panel SHALL present the captured task, messages, and final output with the normal thread reading treatment. Tool calls and results SHALL start collapsed and expand on user action. The viewer SHALL preserve foreground, background, workflow, and nested child identity and SHALL NOT create BB threads to display captures.

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
