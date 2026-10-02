# Compose Chat

A new, independent restyle of BB's native chat, inspired by [Kiki's Compose component](https://21st.dev/@laziekiki/components/compose).

The writing area and follow-up footer share a lightly tinted rounded frame with a faint border, fine divider, and soft shadow. Typing does not add a separate dark outline. Replies stay unboxed. User messages and code use quiet, theme-derived surfaces. Buttons have visible keyboard focus and larger touch targets. BB still owns every input, command, picker, attachment, voice control, and send/stop action.

## Install

Requires BB 0.44 or newer. From this directory:

```sh
npm ci
npm run typecheck
npm run build
bb plugin install .
```

Before enabling Compose Chat, disable Beautiful Chat or another chat restyler yourself. Both plugins target BB's markup; their overlapping CSS is not a supported combination. Compose Chat does not disable or replace any other plugin.

Disable it with the CLI, then reload your BB window if styling remains:

```sh
bb plugin disable compose-chat
```

During the native BB 0.44 check, hot-disable left the styling active for at least 10 seconds. Reloading cleared it. The cause remains unresolved; do not assume live cleanup works without a refresh. See [ACCEPTANCE.md](ACCEPTANCE.md).

A local installation points to this checkout. Do not retire its worktree while you still use it; install from a durable checkout instead.

## Scope

- Uses the active theme's colors, font, and radius. No theme switch or custom font.
- Preserves native compact mode, footer visibility, input layout, focus order, and mobile drawer/keyboard behavior.
- Adds no autocomplete, character counter, new commands, or replacement composer.
- Reads no messages or drafts. No settings, network calls, persistent storage, RPC, timers, or observers.
- A public SDK content script owns only an activation attribute. Its abort and cleanup handlers remove the attribute. Native hot-disable did not trigger observable cleanup in the recorded check; refreshing removed the styling.

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

This requires Python 3, the browser-use CLI, and an existing Arc debugging connection. Use `COMPOSE_CHAT_BROWSER_SESSION` for another owned session. The runner refuses an unrelated tab, checks 16 desktop/touch/state cases, and writes synthetic screenshots and JSON results to the repository's `.impeccable/review/` directory. Stop the local server after inspection.

Set `COMPOSE_CHAT_BROWSER_EVIDENCE_DIR` to keep a revision's evidence separate. `COMPOSE_CHAT_BROWSER_SKIP_SCREENSHOTS=1` runs assertions only and marks every result as screenshot-skipped. This is not a screenshot-validation pass; the default run still rejects invalid PNGs.

To rerun only the split-send regression cases:

```sh
COMPOSE_CHAT_BROWSER_CASES=split-send-empty,split-send-draft npm run test:browser
```

Standalone actions get larger touch targets. Native split-send controls keep BB's joined corners and original widths, including the zero-width hidden options segment. The browser runner bypasses cached build assets in its owned fixture tab.

Unit tests exercise the SDK's actual content-script registration and cleanup, draft/control preservation, scoped CSS, theme-token use, keyboard focus, disabled actions, touch rules, and reduced motion.

The development fixture in `tests/preview.html` represents inspected native composer hooks, with synthetic conversation content. It is not a replacement chat UI and is never registered by the plugin. Browser checks against the fixture do not replace an installed native-BB activation check. See [ACCEPTANCE.md](ACCEPTANCE.md) for the verification performed and its limits.

## Design reference

Compose is listed by its author under MIT. This plugin borrows its visual idea, not its source code, avatar assets, autocomplete implementation, animation library, or character-counter logic. No third-party component or generated mockup is shipped in the runtime bundle.
