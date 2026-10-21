# Diff context demo

The 14-second recording shows Load context, then expansion above and below the same change in Unified and Split views.

- [Video, MP4](demo.mp4).
- [Animated preview](demo.gif).
- [Unified gap controls](unified-controls.png) and [expanded context](unified-expanded.png).
- [Split gap controls](split-controls.png) and [expanded context](split-expanded.png).

## Capture boundary

Captured from the actual BB frontend with the candidate Changes bundle built from feature commit e6a92bd. The existing renderer fixture supplies a synthetic 400-line file and page-local RPC responses. The recording narrows that fixture to its context file. BB supplies React and the native Pierre renderer. Captions identify the actions. Cropping removes the surrounding chat from the public media.

This demonstrates renderer behavior, not full installed-backend acceptance. The recording and the separate 14-check renderer suite leave the installed plugin and saved tabs unchanged. The package suite passed 334 tests before rebasing and 361 tests after incorporating main's video-preview coverage. The 14 renderer checks also cover the refresh-state and loaded-context keyboard-focus regressions.

The installed plugin stays unchanged until merge. This work does not install the candidate, change settings, or merge the PR.
