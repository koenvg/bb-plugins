# Browser annotations

Users mark an element or region in a desktop BB Browser tab, save a comment, and attach the captured region to their draft.

## Sub-features

- annotate-element: click an outlined element and save a comment.
- annotate-region: drag a free region and save it.
- annotate-edit: edit/delete a pin and keep composer pills in sync.
- annotate-send: an approved send includes the saved crop and removes only sent annotations.

## How to get to it (user POV)

- Open a Browser tab in a thread, then choose Annotate beside the address bar.
- Click an element or drag a region; Enter saves, Shift+Enter inserts a newline and Esc cancels.
- Click a pin to edit/delete it, or remove its pill from the composer.

## Driving it with BB and package harnesses

Preconditions:

- Follow [shared Launch and Doctor](../SKILL.md), then this package's [README](../../../../bb-plugin-browser-annotate/README.md). Use the new evidence directory and resolved package/instance/host IDs. Local checks do not install the plugin.
- Installed actions follow [the installed workflow](../references/installed-workflow.md), with exact-checkout identity, needed permissions and an owned record/state ledger. Missing prerequisites remain blockers.

Use the installed workflow and an owned desktop Browser tab on a non-private test page. Choose Annotate, select an element and save a unique comment with Enter. Capture the outlined selection, pin, composer pill and saved crop. Repeat with a dragged region, then edit and cancel to prove the draft behavior. Observe zero sends for this draft-only path. A separate, explicitly approved send must deliver the numbered crop/comment and remove sent pins; failed sends must retain them. There is no standalone browser suite here: `bun run --cwd bb-plugin-browser-annotate test` and `typecheck` exercise controlled SDK boundaries, not desktop capture.

## Gotchas

- Desktop only; iframe contents cannot be annotated.
- It competes with bundled agent-annotations. Ask before disabling either plugin; record and restore the original choice.
- Images are captured when the comment is saved, not when sent. Do not retain screenshots of private pages.
- Deleting an unsent annotation removes its image immediately; sent images remain for one hour. Account for these side effects.
