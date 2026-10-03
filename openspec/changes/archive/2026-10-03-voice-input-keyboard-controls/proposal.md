# Proposal

## Why

BB's native microphone control is keyboard accessible but has no direct start shortcut. Enter does not confirm an active recording. The user approved implementing these controls in Compose Chat rather than changing BB core.

## What Changes

- Register a Compose Chat Start voice input command with Ctrl+Shift+Space, including explicit Control on Mac. Use BB's existing plugin-command rebinding in Keyboard settings.
- Start only in the focused, eligible native composer by activating its microphone button.
- Plain Enter activates native Stop and transcribe. Consume Enter while transcription is pending and suppress held-key repeats across completion. Never submit automatically.
- Escape keeps native BB cancellation unchanged. Preserve focused cancel-button activation, drafts, attachments, pointer controls, and unrelated keyboard input.
- Restore editor focus after keyboard-controlled completion or cancellation only while that voice session still owns focus.
- Dispose listeners, observers, and pending guards on disable or reload. Missing or changed host controls fail closed.

## Capabilities

### New Capabilities

- `voice-input-keyboard-controls`: Plugin-owned shortcuts that delegate capture and transcription to native BB controls.

### Modified Capabilities

None.

## Impact

Implementation and planning remain in this repository. Only Compose Chat changes. No BB-core edits, installed-bundle patches, replacement recorder, transcription API, or new dependency. The plugin now depends on native voice DOM attributes and accessible button labels. BB updates can require adapter changes. BB Keyboard settings show the configured start binding; the native microphone labels are not rewritten with a potentially stale hint.
