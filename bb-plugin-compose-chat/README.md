# Compose Chat

A new, independent restyle of BB's native chat, inspired by [Kiki's Compose component](https://21st.dev/@laziekiki/components/compose).

The writing area and follow-up footer share a lightly tinted rounded frame with a faint border, fine divider, and soft shadow. Typing does not add a separate dark outline. Replies stay unboxed. User messages and code use quiet, theme-derived surfaces. Buttons have visible keyboard focus and larger touch targets. BB still owns every input, picker, attachment, voice control, and send/stop action. Compose Chat adds keyboard access to the native voice controls.

A small nine-dot arrow sweep appears inline beside active tool and Thinking titles inside the conversation. The standalone status above the composer stays native. The lattice uses theme ink with no glow, disappears when an activity completes, and adds no chat DOM or animation dependency. Hidden tabs and BB's collapsed indicators pause the loop. Reduced motion shows a static lattice and removes the subtle standalone-button press animation.

Active rows use the lattice in place of their native activity glyph, keeping one 20px icon/text column. Grouped tool rows indent by that same column; completion restores the native glyph without shifting text.

## Install

Requires BB 0.45 or newer. From this directory:

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

These controls use native BB 0.44 and 0.45 attributes and button labels, not a public voice API. Enter uses "Stop and transcribe recording" or "Stop and add to draft", never "Send voice input". Missing or changed controls cause no voice action. Repeated starts are blocked while microphone permission is pending. A new native "Voice input failed" notification releases that guard. If a host update changes error markup, disable and enable the plugin to reset it. Pointer controls remain native. Focus is restored only for keyboard-controlled sessions while focus still belongs to their composer.

## Scope

- Uses the active theme's colors, font, and radius. No theme switch or custom font.
- Preserves native compact mode, footer visibility, input layout, focus order, and mobile drawer/keyboard behavior.
- Adds a configurable Start voice input command, not a replacement composer or recorder.
- Does not read or write messages, drafts, or audio. No plugin network calls, persistent storage, RPC, or polling.
- Public SDK content scripts own style markers and voice-keyboard listeners. A DOM observer reads native voice state and error-title metadata. Abort removes all listeners and observers and restores owned attributes. BB owns frontend generation updates.

BB's chat DOM is not a public API. The selectors were checked against the BB 0.44 and 0.45 frontend source. A future host release can require selector changes. The user-bubble selector also depends on BB's current message wrapper classes.

## Develop and test

```sh
npm test
npm run typecheck
bb plugin types . --check
npm run build
```

### Browser matrix

Use Node 24.15 or newer in the Node 24 release line. From this package:

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

The pinned Playwright Test 1.64.0 runner starts its own Chromium browser and a local fixture server on `127.0.0.1:56429`. It uses a fresh context for each case, never a signed-in profile or an existing browser. No Python, Browser Use, BB CLI, manual server, or daemon variables are needed. On Linux, use `npx playwright install --with-deps chromium` if browser system libraries are missing.

The server builds the unchanged `app.tsx` entry and its CSS with esbuild on every run. It serves these assets in memory at the fixture's existing `dist/app.js` and `dist/app.css` URLs. It does not overwrite an existing BB build in `dist/`. Only fixture assets are served, with caching disabled. An occupied port fails instead of reusing another server. Playwright owns browser, context and server cleanup on success or failure. Assertions, navigation errors, build errors and timeouts fail the command; retries are disabled.

`npm test` still runs Vitest. Its only discovery change excludes `tests/browser/**`, where Playwright's `*.spec.ts` files live. `browser-evidence.test.ts` retains the complete-PNG and backing-pixel safeguards. The Python daemon/session contract tests were removed because the runner no longer connects to user browsers.

Coverage from `tests/browser-matrix.py` maps one-to-one to the same case names in `tests/browser/matrix.spec.ts`:

| Original cases                                             | Preserved coverage                                                         |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| `hero-dark`, `desktop-dark`, `desktop-light`, `user-width` | Desktop geometry, dark/light themes, four viewport PNGs                    |
| `mobile-dark`, `mobile-light`                              | Touch hit areas, hidden native footer, two viewport PNGs                   |
| `custom-tokens`                                            | Custom theme colors and radius                                             |
| `compact-dark`, `compact-touch`                            | Independently framed compact composer and hidden native footer             |
| `new-thread`, `new-thread-touch`                           | Joined native footer and outward shadow                                    |
| `disabled-action`                                          | Disabled submit semantics                                                  |
| `reduced-motion`                                           | Static lattice and disabled transitions                                    |
| `long-draft`                                               | Long native draft and no horizontal overflow                               |
| `split-send-empty`, `split-send-draft`                     | Native split-send dimensions, joined corners and zero-width hidden options |

All 16 cases run the unchanged `tests/browser-checks.js` assertions through the existing `tests/preview.html` fixture. These include contrast, lattice and glyph alignment, native Thinking expansion, animation states, draft/node identity, native submit behavior, style abort/re-enable and unrelated-editor isolation. Every case also uses a real Tab key event to check native order, `:focus-visible` and the focus outline width.

Results are in `test-results/results.json` and the HTML report in `playwright-report/`. Each case attaches its named checks as JSON. The six original PNG filenames and their `.provenance.json` files are in per-case `test-results/` folders and attached to the report. Provenance records the viewport, validated PNG dimensions, pixel ratio, SHA-256 and hashes of the served build and fixture sources. The pixel ratio is fixed at 1 for repeatable dimensions. Failure screenshots and traces are retained. These directories are ignored by Git and replaced on the next run; copy them before rerunning if needed. Inspect the six images for clipping; PNG validation alone is not visual acceptance.

To rerun only the split-send regression cases:

```sh
npm run test:browser -- --grep split-send
```

To put per-case files in a separate directory, use `--output`. The JSON and HTML reports still use their configured paths:

```sh
npm run test:browser -- --output /tmp/compose-chat-evidence
```

The 16 cases and six screenshots are synthetic fixture evidence, not an installed native-BB acceptance check. Standalone actions get larger touch targets. Native split-send controls keep BB's joined corners and original widths, including the zero-width hidden options segment.

Unit tests exercise the SDK's actual content-script registration and cleanup, draft/control preservation, scoped CSS, theme-token use, keyboard focus, disabled actions, touch rules, and reduced motion.

The development fixture in `tests/preview.html` represents inspected native composer hooks, with synthetic conversation content. It is not a replacement chat UI and is never registered by the plugin. Browser checks against the fixture do not replace an installed native-BB activation check.

## Design reference

Compose is listed by its author under MIT. This plugin borrows its visual idea, not its source code, avatar assets, autocomplete implementation, animation library, or character-counter logic. No third-party component or generated mockup is shipped in the runtime bundle.
