# Verify shared Markdown consumers

Use this recipe for Markdown Reader integration or cross-consumer parity. Read the affected plugin maps first. Install the shared package, Reader, Tasks and Tasks' Quota fixture dependencies from frozen locks. Use the pinned Chromium and package-local build CLIs. These checks do not install or activate plugins.

From the repository root, use fresh evidence directories:

```sh
node verification/BBP-57/clean-build.mjs "$EVIDENCE/clean-build"
bash verification/BBP-57/browser-parity.sh "$EVIDENCE/parity"
```

The clean verifier copies current tracked and untracked source into separate fresh directories, excluding installed dependencies and build outputs. Each consumer is tested with the opposite plugin source absent. Shared tests/build/types run before consumer frozen setup, typecheck, SDK check and production build. Tasks includes its existing Quota development fixture. Minimal PATH excludes ambient BB. Build data is disposable and independent of desktop data. Input and compiled-artifact hashes remain with logs.

The parity runner uses the production Reader opener through its SDK fixture and the real Tasks attachment owner/Dialog. It compares the same generic report at 390 and 960 px viewports, with matched 300 and 640 px document widths in light and dark. Comparisons include content, heading hierarchy, Raw, lists/tasks, tokens and computed styles. Reader fragments and permitted relative links remain active; Tasks destinations remain inactive. Post-toggle Tasks assertions check immediate document/control colors, retained source/IDs, one read, draft and focus return. Retain screenshots and traces for inspection.

Reader owns an ephemeral origin. Tasks must find strict port 4193 free and never reuses or stops another listener. A reader failure prevents a misleading comparison with missing JSON. Historical BBP-53 captures are hashed before and after. Each run refuses an existing evidence directory.

Run complete package tests and existing browser suites separately. A parity subset does not replace source/host confinement, refresh, line ranges, selection, keyboard or original-download regressions. Inspect screenshots; pre-toggle comparison alone does not prove live-theme contrast.

Source ESM/TSX exports are deliberate so BB can compile clean consumers without a pre-build hook. Each compiled plugin contains common code/CSS and uses the host React runtime. The shared module has no loader or filesystem authority. Reader grants come from its authorized source adapter. Tasks supplies deny-all in this integration. Anonymous remote images require CORS and reject the current BB origin.

Keep fixture, clean-build and installed results separate. Exact-source activation, native opening, host permissions and live task records require the installed workflow and explicit approval. [BBP-57 evidence](../../../../verification/BBP-57/report.md) records the completed local scope and remaining gates.
