# Tasks

## 1. Plugin contract and test boundary

- [x] 1.1 Replace the native-core plan with the approved Compose Chat DOM adapter plan, confirm host selectors and public command support, and add failing public-boundary tests for start, confirm, no-send, cancellation, ownership, errors, and disposal.

## 2. Keyboard control implementation

- [x] 2.1 Register the configurable Start voice input plugin command with explicit Ctrl+Shift+Space on Mac and other platforms. Availability and execution require the focused eligible composer, preserve the draft and controls, and do not bypass user overrides.
- [x] 2.2 Implement native voice DOM delegation with start/confirmation guards, Enter during transcription, held-key suppression, unchanged native Escape and focused cancel-button handling, safe missing-control behavior, and single-composer focus ownership.
- [x] 2.3 Restore focus only for keyboard-controlled sessions that retain ownership, add reversible Enter/Escape accessibility metadata, and dispose all listeners, observers, timers, and references on disable/reload.

## 3. Verification and documentation

- [x] 3.1 Update Compose Chat scope and behavior documentation and its production-browser fixture. Run all plugin tests, TypeScript, SDK pin checking, and production build. Verify the built keyboard path in a default test browser without recording real audio or sending messages.
- [x] 3.2 Run the single fresh-context completion review, resolve blocking findings, rerun affected checks, and record verification evidence and remaining native/physical-device limits.
