# Native chat styling and speed borders

Users keep BB's native composer and controls while selecting a chat restyle, keyboard-accessible actions and speed-border effects.

## Sub-features

- compose-native: drafts, attachments, voice, send/stop and Thinking controls stay native.
- compose-layout: desktop, compact, new-thread and touch layouts.
- compose-effect: Glow, Electric, Off and Animate Electric border.
- compose-motion: reduced motion, hidden/clipped composers and modal pause behavior.

## How to get to it (user POV)

- Open an existing thread, compact composer or new-thread draft.
- Open Settings > Installed plugins > Compose Chat, then Speed border effect and Animate Electric border.
- Use the native speed/model selector to choose a supported tier.

## Driving it with BB and package harnesses

Preconditions:

- Follow [shared Launch and Doctor](../SKILL.md), then this package's [README](../../../../bb-plugin-compose-chat/README.md). Use the new evidence directory and resolved package/instance/host IDs. Local checks do not install the plugin.
- Installed actions follow [the installed workflow](../references/installed-workflow.md), with exact-checkout identity, needed permissions and an owned record/state ledger. Missing prerequisites remain blockers.

After package setup/typecheck and Chromium setup, run `"$SKILL/scripts/browser.sh" compose-chat "$EVIDENCE/browser"`. The existing `matrix.spec.ts` covers 16 layout cases and `speed.spec.ts` covers tier/settings transitions. Retain their native node/draft identity, keyboard Tab/focus, disabled submit, touch geometry and motion assertions. Fixture submits are synthetic, not real messages. For installed acceptance, open an owned draft, type unique unsent text, tab through native controls and open/close Thinking. With approval and a settings ledger, select Glow/Electric/Off and motion on/off through Settings; observe frame changes without losing the draft or replacing controls. Cancel/restore the owned draft additions and settings only if concurrent state still matches. Real send/stop requires explicit approval.

## Gotchas

- No model turn is needed to inspect decoration. A live paid tier must not be selected or dispatched just for a screenshot without approval.
- Effects follow BB's picker metadata, not measured response speed.
- Native split-send hidden options can have zero width; preserve BB's layout contract.
- A fixture action does not prove installed content-script activation or native voice behavior.
