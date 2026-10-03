# Design

## Context

The user approved a Compose Chat implementation that uses native DOM controls, accepting that this is less stable than a public voice API. Public `app.commands.register` supports default shortcuts and Keyboard-settings overrides, including explicit Control. Public content scripts can install and clean up DOM listeners. The composer SDK does not expose native start, stop, cancel, or voice state.

BB 0.44 exposes `form[data-promptbox]`, `data-promptbox-voice-active`, and `data-promptbox-voice-controls`. Voice buttons are named Start voice input, Stop and transcribe recording, Transcribing voice input, Cancel recording, and Cancel transcription. Voice-control transition wrappers become inert when exiting. Native microphone activation accepts a programmatic click with zero pointer detail. The editor becomes read-only during capture and transcription. BB's existing Escape listener is global, so plugin cancellation must run first to restrict ownership.

## Decisions

### Delegate through a narrow native DOM adapter

Use a dedicated controller/content script. It identifies one native composer with focus in its recognized editor or native voice controls, excluding other form fields. It validates visibility, inert state, and one consistent recording/transcribing cancel/confirm pair across both labels. It never clicks a submit, send-options, or Stop run control and never reads or writes the draft. Register a rebindable start command with Ctrl+Shift+Space. Availability and execution both recheck the actual focused composer. No hard-coded start-key listener bypasses Keyboard settings.

Use native clicks for capture, confirmation, and cancellation. The native pipeline remains responsible for permission, minimum duration, errors, cancellation, transcript insertion, and attachments. Unknown, missing, hidden, disabled, or ambiguous controls cause no voice action.

### Own only the focused voice session

A window capture listener routes plain Enter before native editor or form submission. Enter on a focused cancel button cancels, rather than confirming. Escape remains host-owned. The plugin does not attempt to replace BB's existing global Escape handler or change its ownership rules. It observes native completion to restore focus for keyboard-controlled sessions.

Focus inside one composer establishes ownership. If control replacement temporarily leaves focus on the body, retain that composer only while no other focus or modal claims it. Focus outside suspends handling and disables restoration. Multiple active composers do not share a global fallback. Composition and modified Enter remain untouched.

### Guard asynchronous transitions without owning the recorder

Latch a keyboard start until native voice activity appears. Keep this guard independent of Enter-session ownership so controlling a second composer cannot release a pending permission request. Release on a newly rendered native Voice input failed toast or composer removal. Do not use a timeout: it could allow another start while the permission dialog is still pending. If a host version changes its error markup, fail closed until the plugin is disabled and enabled again.

Latch confirmation immediately before clicking stop. Consume further Enter until native activity ends. Suppress repeat Enter events after completion until key release or a fresh non-repeat press. Observe native read-only and transition state to restore focus only after the editor is editable and only for sessions controlled by the keyboard. Pointer-only sessions keep native focus behavior.

### Lifecycle and accessibility

Use one controller per content-script generation. Abort removes capture/focus/key-release listeners, disconnects its mutation observer, and prevents later focus or actions. No timer or polling is needed. Native buttons and layout stay unchanged. The registered command exposes its configured binding in BB Keyboard settings. Add only reversible Enter/Escape shortcut metadata to recognized native recording controls, preserving existing metadata and later host changes.

## Verification

Test the public app registration, command availability/execution, and mounted content-script DOM boundary using the SDK harness and native-shaped fixtures. Cover explicit Control, rebinding without a hard-coded listener, focused/compact/new-thread composers, delayed transitions, Enter with no send, cancellation, repeats, composition/modifiers, focus moved elsewhere, multiple composers, errors, missing controls, and teardown. Verify the production bundle in a browser fixture. Real microphone, server transcription, and OS shortcut interception require separate live verification and must not be claimed from fixtures.

## Non-goals

No core changes, private imports, React-internal access, replacement UI, transcript service, automatic send, or persisted plugin configuration. No stale hard-coded microphone shortcut hints after rebinding.
