# Compose Chat verification

Compose Chat is enabled from the durable preview at `/Users/koen/workspace/bb-plugin-compose-chat`; Beautiful Chat is disabled. The approved quieter-frame revision passed 12 unit tests and 494 fixture assertions. Native new-thread measurements and a crop confirm a faint border, soft shadow, and no separate input outline while idle or focused. The full fixture screenshot run remains blocked at the user-width capture. The earlier native hot-disable gap remains unresolved.

## Quieter-frame feedback revision

The user approved ChatGPT-like framing without replacing BB's controls. The fill now mixes 2% host ink into the canvas. Shadows use the host shadow-color token with a theme-derived fallback. The expanded follow-up owns one shadow; the new-thread form and sibling footer keep their native structure and use outward shadows. Sibling plugin banners remain outside the frame. Button keyboard outlines remain visible, but the writing field and its frame have no separate dark outline.

The native idle and focused checks measured the same `1px solid rgb(233, 233, 230)` border, no input/form outline, an unchanged font, and the latest installed bundle `27997dcbdad81eea`. No drafts or controls were edited. Local evidence is under `.impeccable/review/quiet-frame/`: `native-new-thread.png`, `native-quiet-frame.json`, and `browser-checks.json`. These artifacts are not included in this PR.

The screenshot-enabled matrix could not capture the 1615px user-width case in Arc. Assertions were rerun with an explicit skip flag, recorded on all 16 results. Representative desktop fixture images and the native composer crop are available, but the complete screenshot gate is not passed. Earlier evidence below is historical and remains unchanged. The one-review limit was respected; this feedback revision was not reviewed again.

## Checks performed

Baseline: `68daf5555cdd169df39f2681eebdcdb88e7ea231`. Environment: BB 0.44.0, plugin SDK 0.5.29, Node 24.14.0.

| Check | Result |
| --- | --- |
| `npm test` | 12 tests passed in two files |
| `npm run typecheck` | Passed |
| `bb plugin types . --check` | SDK pin matches the host |
| `npm run build` | App, CSS, backend, and metadata bundles produced |
| `npm run test:browser` | 16 cases, 494 assertions passed with screenshots explicitly skipped; screenshot-enabled run blocked at user-width |
| Impeccable detector on runtime CSS/entry | No findings before review; not rerun after the targeted fix |
| Read-only native DOM/frontend inspection | Composer and message hooks checked against BB 0.44 |
| Installed native activation | Durable preview enabled; latest new-thread idle/focused styling verified in Arc. Hot-disable remains unresolved |
| Fresh completion review | Requested changes; its P1 was fixed and regression-tested by the implementation agent. No second review |

The browser matrix mounts the actual built app entry through a minimal fixture runtime. It checks light, dark, custom host tokens, expanded, compact, new-thread, touch, disabled, reduced-motion, long-draft, and coarse-desktop split-send empty/populated cases. It tests real Tab-key focus movement, hit areas, input identity, draft preservation, submit events, abort/re-enable, and document overflow. Minimum measured body contrast was 12.63:1; placeholder contrast was 5.15:1. These values describe the fixture palettes, not every installed theme.

The runner initially stalled on animation frames in a hidden Arc tab. Its capture wait now uses a bounded delay and rejects invalid PNGs. It also checks an explicit completion marker because browser-use can return exit zero for a Python exception. Final checks passed after these test-runner fixes.

## Completion-review fix

The single completion review, recorded locally in `.impeccable/review/completion-review.md`, requested changes because blanket touch sizing revealed a native hidden Send options segment. The implementation agent excluded the entire native split-send compound control from geometry rules, including the reduced-motion selector's matching specificity. No native width reset was added.

A new unit guard and a native-shaped coarse-desktop fixture reproduced the failure before the fix. Empty and populated split-send cases now preserve the options width at 0px and 24px, the native primary/compound dimensions, clipping, joined corners, and document overflow. Standalone hit-area assertions now check width as well as height. The targeted cases passed 76 assertions, followed by the full 16-case, 444-assertion matrix.

The runner now bypasses cached assets while checking its owned fixture tab. Without that bypass, the browser initially retained the prior build's CSS. The full matrix also caught a reduced-motion specificity mismatch introduced by the exclusion; the final matching selector restored zero-duration transitions.

The original reviewer verdict remains "request changes". The implementation agent verified this fix; there was no second review or new reviewer approval.

## Evidence

Evidence artifacts remain in the local working tree under `.impeccable/review/`. They are intentionally not published with this PR, including signed-in native browser records. A fresh checkout contains the fixture and runner needed to produce new synthetic results, not these historical captures.

The following local screenshots show synthetic content, not an installed BB session:

- `desktop.png`, dark, 1440 × 1046
- `desktop-light.png`, light, 1440 × 1046
- `mobile.png`, dark, 390 × 844
- `mobile-light.png`, light, 390 × 844
- `user-1615.png`, 1615 × 990
- `hero-repro.png`, comp-sized, 1504 × 1046

Historical results are in `browser-checks.json`, `detector.json`, and `diff/final/report.json` under that same local directory.

Native evidence is separate under `.impeccable/review/native-check-20261002/`: `report.md`, `native-desktop-empty.png`, and `native-mobile.png`. These show the actual installed plugin during the temporary check, not the fixture.

## Visual scope and limits

The implementation follows the selected Compose-inspired frame, divider, neutral surfaces, and flat replies. It preserves native provider/voice controls and the native action row rather than copying the generated mockup's simplified controls. Font family, font size, widths, and responsive layout remain host-owned. The fixture's sample typography and surrounding app chrome are illustrative.

The pre-review image comparison of the 1440px desktop fixture against the 1504px comp scored 77% overall and reported regional drift/missing-detail findings, including the composer. It is not a pixel-fidelity pass. Surrounding navigation is fixture markup outside the plugin's styling boundary. The Impeccable build-state hero gate has not been closed; no gate was forced or silently declared complete.

The existing repository `DESIGN.md` and its sidecar remain untouched. Runtime colors use host variables, shape derives from the host radius, and interactions use host state tokens. The pre-existing sidecar drift was not repaired as part of this feature. No generated image or reference component ships in the runtime bundle.

## Native results and remaining checks

The approved check used the exact checkout in a dedicated Arc tab. BB served CSS matching the local build byte-for-byte. The shared expanded frame, inherited system font, keyboard focus, and unsent draft preservation passed. At 1440px with a coarse pointer, the native split-send primary stayed 32px wide, its options stayed 24px, and the compound stayed 56px. Visible standalone touch controls measured at least 44px in both dimensions.

Emulated 390px and 320px layouts used BB's native compact state with no footer and no horizontal overflow. The draft survived viewport changes. Reduced-motion emulation removed transitions from the form and visible standalone actions. These checks do not prove physical-device keyboard or drawer behavior.

Hot-disable did not remove the activation marker or stylesheet within the 10-second observation window. Refreshing the owned page removed both while preserving the draft. The cause could be host refresh behavior or lifecycle wiring; this check did not establish it. A fresh-page deactivation pass does not prove live teardown. Do not treat native lifecycle acceptance as complete.

The original Beautiful Chat source, enabled state, and bundle hash were restored. Compose Chat was removed. The controlled unsent draft was cleared back to its original empty state, browser emulation was reset, and the owned native tab was closed. No prompts were sent, no threads or agent runs were created, and no theme settings were changed.

Still unverified natively:

- New-thread input, idle empty split-send hiding, and long drafts.
- Timeline user/assistant/code styling and working/tool-row collapse transitions.
- Attachment, voice, project/branch/access, live send/stop, approvals, and errors.
- Dark and named third-party themes, including Liquid Glass. Dark media emulation did not change the host's selected light palette.
- Mobile drawers, physical-device virtual keyboards, and narrow desktop panes.
- Reliable hot-disable cleanup without a page refresh.

The earlier fixture server and preview tab are also closed. Evidence remains in the local working tree, outside this PR. The mockup fidelity and hero gates remain open, and no second completion review was run.

Native DOM selectors are not a public BB API and can require updates in later releases.
