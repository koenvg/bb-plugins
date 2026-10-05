# Compose Chat

A new, independent restyle of BB's native chat, inspired by [Kiki's Compose component](https://21st.dev/@laziekiki/components/compose).

The writing area and follow-up footer share a lightly tinted rounded frame with a faint border, fine divider, and soft shadow. Typing does not add a separate dark outline. Replies stay unboxed. User messages and code use quiet, theme-derived surfaces. Buttons have visible keyboard focus and larger touch targets. BB still owns every input, picker, attachment, voice control, and send/stop action. Compose Chat adds keyboard access to the native voice controls.

A small nine-dot arrow sweep appears inline beside active tool and Thinking titles inside the conversation. The standalone status above the composer stays native. The lattice uses theme ink with no glow, disappears when an activity completes, and adds no chat DOM or animation dependency. Hidden tabs and BB's collapsed indicators pause the loop. Reduced motion shows a static lattice and removes the subtle standalone-button press animation.

Active rows use the lattice in place of their native activity glyph, keeping one 20px icon/text column. Grouped tool rows indent by that same column; completion restores the native glyph without shifting text.

## Install

Requires BB 0.44 or newer. From this directory:

```sh
npm ci
npm run typecheck
npm run build
bb plugin install .
```

Before enabling Compose Chat, disable Beautiful Chat or another chat restyler yourself. Both plugins target BB's markup; their overlapping CSS is not a supported combination. Compose Chat does not disable or replace any other plugin.

Disable it with the CLI. A visible, connected BB window removes the styling live:

```sh
bb plugin disable compose-chat
```

BB defers plugin updates in hidden tabs until they become visible. Current native checks confirmed cleanup on visibility return without refreshing. Reload remains a recovery option for a stale or disconnected client.

A local installation points to this checkout. Do not retire its worktree while you still use it; install from a durable checkout instead.

## Voice keyboard controls

With focus in the composer, press **Ctrl+Shift+Space** to start recording. Use Control on Mac, not Command. Change or remove Compose Chat's **Start voice input** shortcut in BB's Keyboard settings. The operating system can intercept a shortcut; use another binding if needed.

Press **Enter** during recording to stop and transcribe into the draft. This does not send. Enter does nothing during transcription. After completion, edit the draft or press Enter again to send normally. A held Enter cannot send when transcription completes. **Escape** keeps BB's native cancellation behavior. Enter on the focused cancel button also cancels.

These controls use native BB 0.44 attributes and button labels, not a public voice API. Missing or changed controls cause no voice action. Repeated starts are blocked while microphone permission is pending. A new native "Voice input failed" notification releases that guard. If a host update changes error markup, disable and enable the plugin to reset it. Pointer controls remain native. Focus is restored only for keyboard-controlled sessions while focus still belongs to their composer.

## Scope

- Uses the active theme's colors, font, and radius. No theme switch or custom font.
- Preserves native compact mode, footer visibility, input layout, focus order, and mobile drawer/keyboard behavior.
- Adds a configurable Start voice input command, not a replacement composer or recorder.
- Does not read or write messages, drafts, or audio. No plugin network calls, persistent storage, RPC, or polling.
- Public SDK content scripts own style markers and voice-keyboard listeners. A DOM observer reads native voice state and error-title metadata. Abort removes all listeners and observers and restores owned attributes. BB owns frontend generation updates.

BB's chat DOM is not a public API. The selectors were checked against the native BB 0.44 frontend. A future host release can require selector changes. The user-bubble selector also depends on BB's current message wrapper classes.

## Develop and test

```sh
npm test
npm run typecheck
bb plugin types . --check
npm run build
```

For the optional browser matrix, build first and serve this package locally with `python3 -m http.server 56429 --bind 127.0.0.1`. Open `http://127.0.0.1:56429/tests/preview.html` in a dedicated browser-use session connected to Arc's debugging endpoint:

```sh
browser-use --session compose-chat-preview --cdp-url http://127.0.0.1:9222 tab new http://127.0.0.1:56429/tests/preview.html
npm run test:browser
```

This requires Python 3, the browser-use CLI, and an existing Arc debugging connection. Use `COMPOSE_CHAT_BROWSER_SESSION` for another owned session. The runner refuses an unrelated tab, activates only its owned fixture tab, checks 16 desktop/touch/state cases, and writes six synthetic screenshots with provenance plus JSON results to the repository's `.impeccable/review/` directory. Stop the local server after inspection.

Set `COMPOSE_CHAT_BROWSER_EVIDENCE_DIR` to keep a revision's evidence separate. `COMPOSE_CHAT_BROWSER_SKIP_SCREENSHOTS=1` runs assertions only and marks every result as screenshot-skipped. This is not a screenshot-validation pass; the default run still rejects invalid PNGs.

Relative evidence paths resolve from the CLI's working directory. Captures use the client's native pixel ratio, so a 1615 × 990 CSS viewport can produce a 3230 × 1980 PNG on a 2x display. The runner records and validates both sizes. Inspect the six images for clipping; a valid PNG alone does not prove visual acceptance.

To rerun only the split-send regression cases:

```sh
COMPOSE_CHAT_BROWSER_CASES=split-send-empty,split-send-draft npm run test:browser
```

Standalone actions get larger touch targets. Native split-send controls keep BB's joined corners and original widths, including the zero-width hidden options segment. The browser runner bypasses cached build assets in its owned fixture tab.

Unit tests exercise the SDK's actual content-script registration and cleanup, draft/control preservation, scoped CSS, theme-token use, keyboard focus, disabled actions, touch rules, and reduced motion.

The development fixture in `tests/preview.html` represents inspected native composer hooks, with synthetic conversation content. It is not a replacement chat UI and is never registered by the plugin. Browser checks against the fixture do not replace an installed native-BB activation check.

## Design reference

Compose is listed by its author under MIT. This plugin borrows its visual idea, not its source code, avatar assets, autocomplete implementation, animation library, or character-counter logic. No third-party component or generated mockup is shipped in the runtime bundle.
