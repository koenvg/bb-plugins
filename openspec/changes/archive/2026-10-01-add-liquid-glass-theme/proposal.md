# Proposal

## Why

BB's existing theme mechanism can change its palette, but the requested experience is a shiny, light Liquid Glass-inspired interface. A separate plugin can offer this optional visual treatment without changing BB's default appearance or requiring a core fork.

## What Changes

- Add a selectable Liquid Glass theme plugin with a static pastel blue, pink, and lavender wallpaper.
- Give the sidebar, toolbar, composer, menus, and popovers translucent pearly surfaces, rounded edges, bright rim highlights, and soft shadows.
- Pursue visible edge refraction where the host and browser permit it, with a polished blur-and-highlight fallback rather than a promise of Apple's native rendering.
- Keep chat text, code, diffs, and terminal content on sufficiently opaque backgrounds without text distortion.
- Support reversible theme switching and disabling, with a documented page-reload workaround for stale BB 0.43.4 clients, reduced-transparency preferences, and browsers without backdrop filtering.

## Capabilities

### New Capabilities

- `liquid-glass-theme`: Optional plugin-provided glass appearance, readable content, compatibility fallbacks, and reversible activation.

### Modified Capabilities

None. The project currently has no main capability specs.

## Impact

- New standalone package proposed at `bb-plugin-liquid-glass/`, alongside the existing plugins.
- Uses BB's `bb.themes` manifest contribution and CSS theme loading. Targeted host selectors may be needed beyond semantic colour tokens.
- No changes to BB core, task-board behavior, providers, or persisted thread data.
- Browser rendering and host layout compatibility need live verification. Exact physical refraction and native desktop vibrancy are not guaranteed by the documented theme API.
- Initial delivery is a local plugin, not marketplace publication. Adjustable intensity, animation, and a separately art-directed dark theme are deferred.
