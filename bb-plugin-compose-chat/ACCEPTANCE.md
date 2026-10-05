# Compose Chat verification

## Voice keyboard revision

Implementation baseline: `9ac0de87db93bd54fbbcd083c19eeee62e167a01`.

- All 48 plugin tests passed, including 28 new public-boundary voice scenarios. The test-first run failed 15 of those scenarios before implementation.
- TypeScript, SDK 0.5.29 pin checking, and the production build passed.
- The existing synthetic browser matrix passed 16 cases and 1068 assertions against the updated built app. This revision's matrix was assertion-only, with screenshot captures skipped. No CSS or motion source changed.
- A dedicated managed Chromium session on Mac exercised the built voice fixture with real keyboard input. Ctrl+Shift+Space started one synthetic recording. Enter confirmed once; Enter during transcription did not send. Completion preserved the draft and restored focus. A repeat event held across completion did not send; a fresh Enter submitted once to the fixture's local counter. Escape canceled. A changed binding replaced the original; a disabled binding did not activate. One synthetic recording screenshot was inspected at `/tmp/compose-chat-voice-recording.png`.
- Browser matrix results are local under `.impeccable/review/voice-keyboard/`. The browser-use launcher did not recognize the downloaded Chromium executable name, so the same managed Chromium was started with an isolated temporary profile and connected through a dedicated CDP port. No signed-in browser session was used.

The revision has not been installed in native BB. These tests do not prove real microphone permission, audio capture, server transcription, physical keyboard behavior, or BB Keyboard-settings persistence. The fixture simulates the host command dispatcher and recording states; unit tests validate the public SDK registration and native-shaped DOM delegation. Native Escape ownership remains BB's existing behavior, including its global listener. Pending-start error recovery depends on BB's current voice-error title markup; unknown markup fails closed until plugin reload.

The single completion reviewer requested changes for three boundary defects. Five new regression cases failed before the fixes. Pending-start guards now survive changes in Enter-session ownership. Focus must be in the recognized editor or native voice controls, not an unrelated form field. Recording and transcription controls must have one consistent cancel/confirm pair across both labels. All 48 tests, TypeScript, SDK pin checking, production build, the built voice keyboard path, and the 16-case browser assertion matrix passed again after these fixes. No second review pass was run, and no later reviewer approval is claimed.

## Arrow and indentation revision

The arrow update uses the reference's row-major phase groups `[1,2,3, 0,1,2, 1,2,3]` in an independently authored CSS sweep. The four groups advance in 90ms steps over a 648ms cycle. The loader stays inline; standalone status and native composer controls remain unchanged.

The marker now reserves the same 20px column as BB's 14px glyph plus 6px gap. An active title replaces its preceding native glyph, including plugin-mask spans, instead of adding a second column. Completion restores the glyph without shifting the text. Bundle children get 20px logical padding; already-indented delegation lists remain untouched.

Validation passed 20 unit tests, TypeScript, SDK pin checking, production build, and the full 16-case browser matrix with 1068 assertions. The fixture now models a native bundle, its glyph/title wrapper, and an active child row. Checks cover nested indentation, active/completed text alignment, glyph restoration, disable cleanup, reduced motion, themes, and existing control preservation. Synthetic screenshots and provenance are under `.impeccable/review/arrow-lattice/`.

A dedicated Arc tab of the real thread was inspected without changing drafts or sending messages. A temporary stylesheet preview changed bundle padding from 0px to 20px, confirmed a 20px marker column, the arrow animation name, no native shimmer mask, and hidden native glyphs only on active titles. Desktop native and desktop/mobile fixture screenshots were inspected. This preview is not yet evidence of SDK activation after installing the new bundle, and physical-device/performance coverage remains open. Native screenshot `/tmp/compose-arrow-native.png` stays outside the repository.

The single arrow-revision reviewer requested a fix for plugin-mask glyphs, whose native element is a span rather than an SVG. The direct-child selector now uses canonical `[data-icon-root]`; fixture checks cover active/completed alignment and glyph restoration for both shapes. The missing top-left dot was also fixed by painting the pseudo-element's background in sync with its arrow phase, since a zero-offset outer shadow cannot fill the element itself. Both regressions were reproduced test-first and the complete checks rerun. The review's blocking finding is resolved without a second review pass.

## Spiral-motion revision

The inline spiral-motion change passed 17 unit tests, TypeScript, the SDK pin check, and a production build. The synthetic browser matrix passed 16 cases and 860 assertions in a dedicated headless Chromium session. Desktop and mobile screenshots in light and dark were inspected, including inline lattice alignment and control clipping. Evidence lives under `.impeccable/review/inline-lattice/`; the earlier `.impeccable/review/lattice/` captures show the superseded standalone placement.

The new checks cover inline tool/Thinking decoration, unchanged standalone status, completion/remount, synthetic Thinking expansion/collapse, native label preservation, reduced motion, inherited collapsed-state pausing, hidden-document pausing, marker restoration, disable/re-enable, and unchanged split-send geometry. The animation is an independently authored CSS interpretation of the React Bits spiral reference, not its React component. One empty pseudo-element paints nine dots; no messages are read or replaced.

The selector follows the inspected BB 0.44 `TimelineTitleView` wrapper and active shimmer segments inside `ThreadTimelineRows`. This revision has not been installed or exercised in native BB. The earlier native activation evidence below predates it and does not verify the new loader, native Thinking expansion, or physical-device performance. The plugin's name and install ID remain unchanged pending the user's rename decision.

The single completion reviewer found that BB's APNG shimmer mask survived the original CSS reset. Both mask-image properties now clear on decorated inline titles, and native will-change resets to auto. Unit and browser regression checks cover mask removal/restoration with native shimmer properties and an authored static SVG mask stand-in. The fixture does not reproduce the APNG animation itself. The reviewer returned request changes before the placement correction and mask fix; those changes were revalidated without a second review pass.

## Earlier verification

The review-preparation run passed 12 unit tests and the complete synthetic browser matrix: 16 cases, 494 assertions, and all six requested screenshots. The screenshots were inspected for clipped edges, missing controls, wrapping, and framing. Native cleanup passed in a visible Arc tab and after resuming a hidden tab. No runtime styling or lifecycle code changed during this follow-up.

Compose Chat remains enabled from `/Users/koen/workspace/bb-plugin-compose-chat`; Beautiful Chat remains disabled. Codex Inspired is the selected, independently installed theme.

## Checks performed

Original implementation baseline: `68daf5555cdd169df39f2681eebdcdb88e7ea231`. Review-preparation baseline: `5c82bba84405684d8a8a7e9584ff2e9e729d6fb1`. Native host: BB 0.44.0, SDK 0.5.29.

| Check                                | Result                                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `npm test`                           | 12 tests passed in two files                                                                                         |
| `npm run typecheck`                  | Passed                                                                                                               |
| `bb plugin types . --check`          | SDK pin matches the host                                                                                             |
| `npm run build`                      | App, CSS, backend, and metadata bundles produced                                                                     |
| `npm run test:browser`               | 16 cases, 494 assertions, six complete screenshots; captures not skipped                                             |
| Screenshot inspection                | All six final surface captures show the complete viewport, including right-side controls                             |
| Native visible-tab disable/re-enable | Marker and CSS removed without refreshing; editor identity preserved                                                 |
| Native hidden-tab disable/resume     | Update deferred while hidden; marker and CSS removed after visibility returned, with editor and draft unchanged      |
| Single completion review             | Requested changes for split-send geometry; P1 fixed and regression-tested. No second review or new reviewer approval |

The fixture mounts the actual built app entry through a minimal runtime. Its cases cover light, dark, custom host tokens, expanded, compact, new-thread, touch, disabled actions, reduced motion, long drafts, and coarse-desktop split-send empty/populated states. Assertions check real Tab-key focus, hit areas, input identity, draft preservation, submit events, abort/re-enable, geometry, contrast, and overflow. Fixture body contrast was at least 12.63:1 and placeholder contrast at least 5.15:1. These are fixture measurements, not guarantees for every installed theme.

## Screenshot runner correction

The original screenshot-enabled run reproduced an empty PNG payload at the 1615px user-width case. A view-capture experiment returned valid PNG files but clipped wide pages to Arc's narrower content area. Those images were rejected after inspection.

The final runner keeps surface capture, uses the client's native pixel ratio instead of forcing 1x, and activates its owned fixture after navigation. It validates requested theme/layout/viewport, complete PNG framing, and pixel dimensions. Each image records its scale, SHA256, and source hashes. The final run used 2x pixels: for example, the 1615 × 990 CSS viewport produced a complete 3230 × 1980 PNG. Browser assertions still measure CSS pixels. No browser window resize or alternate browser was used.

The earlier 494-assertion run with screenshots explicitly skipped remains historical assertion-only evidence. It is not the final screenshot-validation run.

## Native lifecycle behavior

The earlier check saw styling remain after CLI disable for at least ten seconds. Current controlled checks explain the visibility boundary. BB 0.44 buffers system/plugin changes while a document is hidden, then reconciles them when it becomes visible. This behavior is present in the shipped host's realtime invalidation code, not a polling workaround in Compose Chat.

In the visible local-BB Arc tab, disable removed the marker and stylesheet within the first measured 197ms; re-enable restored them without replacing the editor. In a separate hidden-tab check, both remained after two seconds while hidden. Returning to the tab removed them within 433ms without a reload, preserving the editor and draft. Re-enable restored the marker and stylesheet within 304ms. These are observations, not timing guarantees. Refresh remains a recovery option for a disconnected or stale client.

The remote BB Connect URL was offline during this follow-up. Native checks used the same Arc browser against the local BB origin. No prompts were sent, threads or agent runs created, attachments added, voice recordings started, or draft contents edited. The active theme was not changed.

## Original completion-review fix

The single reviewer requested changes because blanket touch sizing revealed BB's hidden Send options segment. The implementation agent excluded the native split-send compound from geometry overrides and corrected reduced-motion selector specificity. A regression fixture reproduced the failure before the fix.

Empty/populated options widths remain 0px/24px; primary and compound dimensions, clipping, joined corners, and overflow remain native. The targeted cases passed 76 assertions before the broader matrices. The original reviewer verdict remains "request changes"; the implementation agent resolved and verified the P1 without a second reviewer pass.

## Quieter-frame native evidence

The approved revision uses 2% host ink, a faint host border, and host-derived soft shadows. Expanded follow-ups own one shared shadow. New-thread form/footer siblings retain their structure, and plugin banners remain outside the frame. Writing-field outlines stay absent; button keyboard focus remains visible.

Earlier native idle/focused measurements recorded the same `1px solid rgb(233, 233, 230)` border, no editor/form outline, unchanged font, and installed bundle `27997dcbdad81eea`. Earlier expanded and emulated 390px/320px native checks covered focus, draft preservation, footer hiding, split-send sizing, and reduced motion. They do not establish physical-device behavior.

## Evidence boundaries and remaining coverage

Evidence stays in the local working tree, outside this public PR. The latest fixture PNGs, provenance sidecars, `browser-checks.json`, and `native-lifecycle.json` are under `.impeccable/review/ready-for-review/`. Earlier evidence remains under `quiet-frame/` and `native-check-20261002/`. A fresh checkout includes the fixture and runner, not signed-in native browser records or historical captures.

Ready for code review does not mean every product/release check has passed:

- Native timeline/user/assistant/code transitions and working/tool-row collapse still need functional coverage.
- Native new-thread editing, long drafts, attachment/voice pickers, project/access controls, live send/stop, approvals, and errors are not fully exercised.
- Physical mobile keyboards/drawers, narrow desktop panes, and other named themes including Liquid Glass remain unverified.
- Direct native-desktop inspection was not performed; native application checks here ran in Arc.
- Exact generated-mockup fidelity and the Impeccable hero gate remain open. The historical 77% comparison is not a fidelity pass. Native control preservation and the subsequently approved quieter frame remain the implementation priorities.

The repository's existing `DESIGN.md` and sidecar remain untouched. Native DOM selectors are not a public BB API and may require updates after host releases. No generated image, reference component implementation, or private palette ships at runtime.
