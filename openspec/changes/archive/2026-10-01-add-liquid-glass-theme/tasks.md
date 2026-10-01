# Tasks

## 1. Plugin registration and host compatibility

- [x] 1.1 Confirm the installed BB version, theme CSS loading/removal behavior, and target selectors for sidebar, toolbar, composer, and portalled controls; record the selector map and compatibility findings, stopping if CSS-only integration cannot meet the design without core changes.
- [x] 1.2 Scaffold `bb-plugin-liquid-glass` with the BB CLI, remove unused app functionality, and register the theme contribution with valid branding and compatible SDK/engine versions; verify manifest paths with automated checks and run `bb plugin build` successfully.
- [x] 1.3 Document local installation, explicit selection, light-mode recommendation, and rollback; verify the plugin appears in `bb theme list` without changing the active theme on install.

## 2. Wallpaper and shiny glass material

- [x] 2.1 Add semantic colours, static local pastel gradients, and plugin-prefixed material tokens; add CSS parsing and no-remote-asset checks and verify the wallpaper and body text contrast in the live light-mode view.
- [x] 2.2 Style the mapped sidebar, toolbar, composer, menus, and popovers with rounded translucent fills, blur, rim highlights, and shadows while preserving positioning; add selector regression checks and capture wide and compact screenshots showing all target components.
- [ ] 2.3 Keep chat, code, diffs, and terminals free of decorative filtering with sufficiently opaque backgrounds; verify contrast of at least 4.5:1 over wallpaper extremes and test selection, copying, typing, focus, scrolling, and menu placement in the live client.
- [x] 2.4 Run the bounded CSS-only edge-refraction experiment; retain it only if it avoids text distortion, DOM injection, and rendering regressions, and document the result with screenshots or explicitly record the blur-and-highlight fallback.

## 3. Accessibility and fallback behavior

- [x] 3.1 Add opaque baseline styling, unsupported-backdrop-filter fallback, reduced-transparency handling, and forced-colour compatibility; verify CSS checks and browser-emulated fallback states keep labels and focus indicators readable.
- [x] 3.2 Add conservative dark-mode compatibility without changing the user's preference; verify light/dark switching and document that the primary art direction is light mode.
- [x] 3.3 Record the tested host/browser versions, refraction limitations, and a repeatable visual regression checklist in the plugin documentation; verify each documented limitation matches observed behavior.

## 4. Integration acceptance

- [x] 4.1 Run the package's checks and production build, then verify selection persistence across reloads and complete style removal on switching, disabling, and removal, reloading stale clients as permitted by the accepted host limitation; restore the prior selection and record results.
- [x] 4.2 Compare populated-thread scrolling and typing against the default theme in Arc, including compact layout and open menus; remove optional effects that cause visible stutter or sustained repainting and record screenshots plus the performance observations.
- [x] 4.3 Present the light pearly result and fallback screenshots for visual review, recording any remaining deviations from the requested shiny Apple-demo appearance rather than claiming native rendering equivalence.
