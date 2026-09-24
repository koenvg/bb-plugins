# Design

## Context

See proposal.md for motivation. This repository contains standalone BB plugins rather than BB core. The existing task-board package uses the `bb` package manifest, a server entry, and the published plugin SDK. Installed BB documentation confirms `bb.themes` contributions with plugin-relative CSS and selectable IDs of `plugin:<plugin-id>:<theme-id>`.

The installed theme-authoring guide documents semantic custom properties, light and dark blocks, and element-scoped overrides. It does not guarantee arbitrary visual effects, stable selectors for every host component, or SVG backdrop refraction. The live host DOM and CSS loading behavior have not yet been verified. This design is included because rendering compatibility and global CSS isolation need explicit decisions.

## Goals / Non-Goals

Goals:
- Package the appearance separately from existing feature plugins.
- Keep host integration small and auditable, with semantic tokens separated from layout-specific selectors.
- Deliver the requested light pearly design with a readable dark compatibility path.

Non-goals:
- BB core changes, native macOS window vibrancy, exact replication of Apple's renderer, or a JavaScript animation engine.
- User-selectable wallpapers, intensity controls, a dedicated dark visual design, or marketplace publication in this change.
- Replacing BB components or altering interaction logic.

## Decisions

### Use a theme contribution, not an app replacement

Create `bb-plugin-liquid-glass/` using BB's scaffold during implementation, retaining only the manifest, minimal backend if required, theme CSS, documentation, and verification assets needed for this plugin. Register a theme named Liquid Glass through `bb.themes`. Pin SDK and engine compatibility to the verified target BB version rather than copying another plugin's versions blindly.

A custom frontend or content script would introduce lifecycle work and privileged DOM mutation. Do not add one merely to achieve refraction. If the existing theme loader cannot apply the required CSS, stop and report that blocker rather than expanding into core changes.

### Separate palette, material, and host targeting

Keep readable semantic colours in the documented `:root, .light` and `.dark` blocks. Define plugin-prefixed material variables for tint, blur, rim highlights, radii, and shadows. Group host selectors in a clearly documented section with the tested BB version and the intended component for each selector.

Prefer stable host data attributes when they exist. Avoid hashed classes, DOM position selectors, and blanket overrides of every card or text background. A small set of targeted overrides is less invasive than changing all app surfaces. Confirm that these rules are removed when BB unloads the selected theme; do not assume a theme-specific DOM attribute exists.

### Use a static procedural wallpaper and layered CSS glass

Use local CSS gradients for the pastel wallpaper, with no remote image requests or image-generation dependency. Render glass on the sidebar, toolbar, composer, and floating controls using translucent fills, backdrop blur and saturation, inset highlights, and soft outer shadows. Restrict decorative pseudo-elements to non-interactive layers.

Preserve existing positioning and scroll containers. Do not apply transforms or filters to ancestors that would change fixed-position menus or portal stacking. Keep chat, source, diffs, and terminals on sufficiently opaque content surfaces.

### Treat refraction as progressive enhancement

First prove the glass material and selection lifecycle on the actual BB client. Run a bounded experiment with CSS-supported edge distortion only if theme CSS can provide it without injected DOM, continuous rendering, or filtering text. Browser feature detection alone does not prove correct compositing; verify visually.

If that experiment fails, ship the shiny blur-and-highlight treatment and document that it is an approximation without physical refraction. Do not claim visual equivalence to Apple's native renderer. Record screenshots of the chosen result for review.

### Preserve preferences and provide fallbacks

Do not activate the theme on install or change light/dark mode. Scope the pastel art direction to light mode, with conservative dark colours for compatibility. Use an opaque baseline, enabling translucency only when backdrop filtering is supported. Honor `prefers-reduced-transparency` where exposed; forced-colour modes should defer to system colours. No default animation or pointer tracking is needed.

### Verify appearance and behavior separately

Automated checks cover manifest paths, CSS parsing, scoped selector expectations, fallback rules, and forbidden remote assets or continuous animation. They cannot establish visual quality.

Use the signed-in Arc session for live browser verification, requesting connection help if unavailable. Capture wide and compact layouts, open menus, code/diff content, light and dark modes, and fallback states. Measure body-text contrast on composited backgrounds rather than relying solely on token swatches. Check selecting, copying, typing, keyboard focus, scrolling, theme switching, disabling, and re-enabling.

Compare a repeatable populated-thread scroll and typing session with the default theme. Investigate visible stutter or sustained repainting; reduce blur areas or remove optional distortion before accepting the result. Record the host/browser versions and any unverified clients without claiming blanket compatibility.

## Risks / Trade-offs

- Host selectors can change between BB versions. Mitigation: centralize them, document the tested version, and keep a regression checklist.
- Backdrop filtering and portals can create expensive or incorrect compositing. Mitigation: limit filtered regions and avoid filtered common ancestors.
- Translucency can reduce contrast unpredictably. Mitigation: opaque content backing and contrast checks across wallpaper extremes.
- Physical refraction may not be possible in a CSS-only theme. Mitigation: explicitly bounded enhancement with an honest shiny fallback.
- A reduced-transparency preference is not exposed by every browser. Mitigation: unsupported-filter fallback remains available; document tested preference support.

## Migration Plan

The user accepted BB 0.43.4's stale-client limitation during implementation. Reload the page after theme selection or removal when needed. Verify removal after that reload; host synchronization changes are out of scope.

There is no data migration. Build and verify the new package, install it locally for testing, then select it explicitly while preserving the previous selection for rollback. To roll back, select the previous theme or disable the plugin and verify that wallpaper and component overrides disappear. Do not modify existing feature plugins or publish to a marketplace as part of this change.
