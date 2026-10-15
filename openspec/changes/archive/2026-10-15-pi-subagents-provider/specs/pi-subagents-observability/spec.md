# Spec Delta

## Purpose

Let users view Pi child progress and captured results inside BB through bounded, structured, read-only observations of foreground and background delegation.

## ADDED Requirements

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
