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
