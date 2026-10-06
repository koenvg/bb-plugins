# voice-input-keyboard-controls Specification

## Purpose

Define Compose Chat's keyboard controls for native voice input. Users can configure the start shortcut, use Enter to transcribe without sending, and cancel with native controls while preserving draft contents and focus.

## Requirements

### Requirement: Configurable keyboard start

Compose Chat SHALL register Start voice input with Ctrl+Shift+Space on all supported platforms, using Control rather than Mod on Mac. BB's existing plugin-command Keyboard settings SHALL control rebinding and removal. The plugin SHALL NOT install a competing hard-coded start-key handler.

#### Scenario: Focused start

- **WHEN** the configured command runs with focus in a visible eligible native composer
- **THEN** the plugin activates that composer's enabled native microphone control once
- **AND** drafts, mentions, attachments, and existing controls are unchanged

#### Scenario: Configuration and Mac

- **WHEN** BB applies the command's default or a user override
- **THEN** the default declares explicit Control on Mac and the effective shortcut is owned by BB
- **AND** disabled or rebound commands are not bypassed by the content script

### Requirement: Eligible and safe native delegation

The plugin SHALL act only on recognized, visible, non-inert native voice controls in the focused composer. It SHALL NOT activate a send or run-stop control, start an active recording, or start in a locked editor, dialog, unrelated input, terminal, or browser panel. Pending starts SHALL be guarded until native activity or a recognized native voice error appears; unknown or missing controls SHALL cause no voice action.

#### Scenario: Pending or unavailable capture

- **WHEN** capture is pending, recording, or transcribing, or the expected native controls are missing or disabled
- **THEN** the plugin does not request another capture or click another action

#### Scenario: Multiple composers

- **WHEN** multiple composers are mounted
- **THEN** only the focused eligible composer can receive voice actions
- **AND** an unrelated surface's Enter events do not confirm another composer's recording

#### Scenario: Another composer completes while permission is pending

- **WHEN** composer A has a pending start and the user controls and completes composer B's native voice session
- **THEN** composer A's pending-start guard remains intact until its own native activity or a recognized voice error appears

#### Scenario: Unrelated input inside the composer form

- **WHEN** an unrelated nested input has focus inside a native composer form
- **THEN** it cannot start or confirm voice input through the plugin

#### Scenario: Mixed recording and transcription controls

- **WHEN** native controls contain both cancel labels, both confirm labels, or a mismatched recording/transcription pair
- **THEN** the plugin activates neither confirmation nor cancellation

### Requirement: Enter transcribes without sending

During an owned recording, plain Enter SHALL activate the native Stop and transcribe control once. During transcription it SHALL be consumed without confirming again or submitting. Enter on the focused cancel control SHALL cancel instead. Held-key repeats across completion SHALL not send. Normal submission SHALL require a separate Enter press after completion.

#### Scenario: Confirm and review

- **WHEN** plain Enter confirms a valid native recording
- **THEN** the native pipeline transcribes and inserts into the draft
- **AND** no message is sent, queued, or scheduled
- **AND** a new Enter press after completion follows normal submission rules

#### Scenario: Pending and held Enter

- **WHEN** Enter is pressed during transcription or repeats across a fast completion
- **THEN** the plugin consumes it and does not confirm twice or send

#### Scenario: Composition and modified Enter

- **WHEN** Enter is composing text, has legacy composition key code, or carries a modifier
- **THEN** it does not trigger the plugin's recording-confirm action

### Requirement: Cancellation and focus preserve native behavior

Escape SHALL retain BB's existing native cancellation behavior; the plugin SHALL NOT replace the host's Escape handler. Cancel-button activation SHALL stay keyboard accessible. Focus SHALL return to the editable draft after keyboard-controlled completion or cancellation only while the session retains ownership. Pointer-only sessions SHALL retain native focus behavior. Existing native failures and cancellation SHALL not become submission paths.

#### Scenario: Cancel pending transcription

- **WHEN** the user presses Escape or activates the focused cancel control
- **THEN** native cancellation runs once, no message is sent, and the native pipeline rejects late transcripts

#### Scenario: Focus moved elsewhere

- **WHEN** the user focuses another pane, input, or dialog before completion
- **THEN** the plugin does not steal focus or intercept that surface's Enter as a voice action

#### Scenario: Failure or pointer session

- **WHEN** native permission or transcription fails, or a session is controlled only by pointer
- **THEN** the plugin preserves native feedback, draft contents, and pointer focus behavior without sending

### Requirement: Cleanup and accessible guidance

The plugin SHALL expose its start command in BB's configurable command system, provide reversible Enter/Escape shortcut metadata on recognized recording controls, and preserve native layout and labels. On abort, disable, or reload it SHALL release every owned listener, observer, timer, metadata change, and reference.

#### Scenario: Disable or replacement

- **WHEN** the content script is aborted or disposed during a pending voice transition
- **THEN** later mutations or keyboard events cause no plugin action or focus change
- **AND** native controls and later host metadata changes are preserved
