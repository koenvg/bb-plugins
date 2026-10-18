# Verify shared Markdown consumers

Use this recipe for Markdown Reader integration or cross-consumer parity. Read both affected plugin maps. Install the shared package, Reader, Tasks and Tasks' Quota fixture dependencies from frozen locks. Use pinned Chromium and package-local build CLIs. These checks do not install or activate plugins.

From the repository root, use fresh private evidence directories:

```sh
node verification/BBP-57/clean-build.mjs "$EVIDENCE/clean-build"
bash verification/BBP-57/browser-parity.sh "$EVIDENCE/parity"
```

The clean verifier copies current tracked and untracked source without installed dependencies or build outputs. Each consumer has the opposite plugin source absent. It verifies compiled shared ESM, then removes its own shared dist before consumer setup/build. It clears ambient `BB_*` values, uses private build data and checks the declared pinned toolchain. Input and compiled-artifact hashes remain with logs. This is independent package proof, not a check against the running desktop SDK.

The parity runner uses the production Reader opener through its SDK fixture and the actual Tasks attachment owner/Dialog. It compares one generic report at matched compact/desktop content widths in light/dark. It checks content, headings, Raw, lists, tokens, computed styles and immediate post-toggle colors, IDs, one read, draft and focus return. Both consumers support local navigation. Reader-authorized relative links remain active; Tasks has no filesystem binding. Inspect screenshots and traces.

Reader and Tasks each own an ephemeral loopback origin. Neither runner reuses or stops another listener. A Reader failure blocks comparison with missing JSON. Historical BBP-53 captures are hashed before and after. Each runner refuses an existing evidence directory.

Run complete package tests and browser suites separately. Parity does not replace source/host confinement, refresh, ranges, selection, native modifiers, image lifecycle or original-download regressions.

Source ESM/TSX exports are deliberate. Each consumer bundles common code/CSS and uses host-owned React. Reader source authority remains in its adapter. Tasks explicitly enables local fragments, BB-preference HTTP(S) links and bounded credential-free remote raster images. [The public interface](../../../../packages/markdown-document/README.md) defines permissions and limits.

Keep fixture, pinned-build and installed results separate. Current-host SDK alignment, exact-source activation, native opening, host permissions and live task records require the installed workflow and explicit approval. [BBP-57 evidence](../../../../verification/BBP-57/report.md) records the local scope and remaining gates.
