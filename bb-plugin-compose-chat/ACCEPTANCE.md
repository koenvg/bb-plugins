# Compose Chat verification

The review-preparation run passed 12 unit tests and the complete synthetic browser matrix: 16 cases, 494 assertions, and all six requested screenshots. The screenshots were inspected for clipped edges, missing controls, wrapping, and framing. Native cleanup passed in a visible Arc tab and after resuming a hidden tab. No runtime styling or lifecycle code changed during this follow-up.

Compose Chat remains enabled from `/Users/koen/workspace/bb-plugin-compose-chat`; Beautiful Chat remains disabled. Codex Inspired is the selected, independently installed theme.

## Checks performed

Original implementation baseline: `68daf5555cdd169df39f2681eebdcdb88e7ea231`. Review-preparation baseline: `5c82bba84405684d8a8a7e9584ff2e9e729d6fb1`. Native host: BB 0.44.0, SDK 0.5.29.

| Check | Result |
| --- | --- |
| `npm test` | 12 tests passed in two files |
| `npm run typecheck` | Passed |
| `bb plugin types . --check` | SDK pin matches the host |
| `npm run build` | App, CSS, backend, and metadata bundles produced |
| `npm run test:browser` | 16 cases, 494 assertions, six complete screenshots; captures not skipped |
| Screenshot inspection | All six final surface captures show the complete viewport, including right-side controls |
| Native visible-tab disable/re-enable | Marker and CSS removed without refreshing; editor identity preserved |
| Native hidden-tab disable/resume | Update deferred while hidden; marker and CSS removed after visibility returned, with editor and draft unchanged |
| Single completion review | Requested changes for split-send geometry; P1 fixed and regression-tested. No second review or new reviewer approval |

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
