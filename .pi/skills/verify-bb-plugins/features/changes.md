# Thread diff review

Users review a thread's diff, mark viewed files, write line comments and send a combined review to the thread agent.

## Sub-features

- changes-target: All changes, Uncommitted, Committed on branch and single-commit targets.
- changes-layout: Unified/Split view, outline navigation and resizing.
- changes-viewed: Viewed persists per thread/target and invalidates on changed patches.
- changes-feedback: pending comments, out-of-diff comments and approved Send feedback.
- changes-filename-controls: Open workspace files with mouse, Enter, and Space through BB's runtime diff renderer.
- changes-video: Explicit per-side MP4/WebM loading, bounded host reads, native playback and unload.

## How to get to it (user POV)

- Open Changes from the thread right-panel new-tab list.
- Choose a diff target and Unified view or Split view; select a file in the outline.
- Choose + in a line gutter, then Add to review; choose Send feedback to inspect the pending review.

## Driving it with BB and package harnesses

Preconditions:

- Follow [shared Launch and Doctor](../SKILL.md), then this package's [README](../../../../bb-plugin-changes/README.md). Use the new evidence directory and resolved package/instance/host IDs. Local checks do not install the plugin.
- Installed actions follow [the installed workflow](../references/installed-workflow.md), with exact-checkout identity, needed permissions and an owned record/state ledger. Missing prerequisites remain blockers.

Require an owned Git workspace with known text changes and no commit/push operations during the proof. In the installed Changes tab, switch targets, navigate a file, add a uniquely identified comment with Add to review, then open Send feedback and Cancel. Capture both line activation and the retained pending review; observe zero agent messages. Toggle Viewed, reopen the panel, and prove persistence; after an approved owned patch edit and Refresh, prove invalidation. Send to agent requires separate approval and proof of one resulting message/queue entry, not only an empty review. Run `bun run --cwd bb-plugin-changes test` and `typecheck` locally; its shared review-ui dependency requires the sibling layout.

For filename controls, run the [BB-backed renderer check](../../../../bb-plugin-changes/tests/bb-renderer/README.md). It uses the owned thread's real BB renderer and native file viewer, with per-page frontend, RPC, and panel-tab fixtures. It never installs or reloads a plugin. Keep this result separate from the full installed workflow above and from CI's fixture boundary tests. Its report records positive and unsupported-slot candidates, native content, unchanged installation and saved tabs, and browser cleanup.

For video playback, follow the [owned local fixture recipe](../../../../bb-plugin-changes/tests/video-browser/README.md). It compiles the production shared component, binds an ephemeral loopback port, generates owned clips with ffmpeg, and verifies decoded MP4 H.264/AAC and WebM VP8/VP9/Opus frames at wide and narrow widths. It does not use BB authentication or change installed sources. Keep it separate from installed Changes playback and the BB-backed filename renderer check.

## Gotchas

- This is thread-local review, not GitHub review; it never commits or pushes.
- Pending comments survive tab switches but not BB reload. Viewed marks do survive reload.
- The outline appears at panel widths of 768px or more.
- A failed save must revert Viewed and show the error. Do not delete another user's marks as cleanup.
