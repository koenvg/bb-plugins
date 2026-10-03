# Codex Inspired move verification

## Status

Repository packaging and this laptop's source migration passed. BB now loads Codex Inspired from the durable repository checkout. The old standalone directory was removed after guarded verification. This verification record was completed before Git publication.

The pre-implementation commit is `9ac0de87db93bd54fbbcd083c19eeee62e167a01`. Scope is OpenSpec change `move-codex-inspired-theme-into-repo`, including the new package, root installation documentation, and CI matrix entry.

## Package checks

- Passed: original CSS and backend source copied into the repository; the stylesheet is byte-identical to the active standalone theme.
- Passed: CSS SHA256 `98dbfecfba24c5ea129106c4ac3c295c4137f2744451af81e1caf3f87fbc0b61`.
- Passed: `npm ci`, `npm test`, and `npm run typecheck` on Node 24.15.0, npm 11.12.1, Vitest 5.0.3.
- Passed: five automated tests covering plugin/theme identity, compatibility floors, manifest CSS resolution and checksum, absence of runtime contributions, release file declarations, and host-API-free activation and reload.
- Passed: test-first checkpoint. The stylesheet and backend tests failed before their files were added, then all five tests passed.
- Passed: a separate clean package copy installed locked dependencies and ran tests and typecheck. It needed no standalone-folder files or BB account credentials.
- Passed: test-only CSS alteration failed the checksum assertion. A test-only invalid manifest CSS path failed identity and file-resolution tests. Both mutations were confined to a temporary copy.
- Passed: `bb plugin types --check` matched SDK 0.5.29 and the local BB host.
- Passed: `npm run build` produced backend JavaScript, source map, and metadata for `codex-inspired` version `0.1.0`, BB 0.44.0, SDK 0.5.29.
- Passed: `npm pack --dry-run --json` listed `package.json`, `server.ts`, the three backend artifacts, `themes/codex-inspired.css`, README, and plugin overview. No frontend bundle or runtime dependency is required.
- Passed: generated backend artifacts are ignored by Git; runtime JavaScript contains no absolute local-folder reference. The source map uses a relative source path.
- Passed: root README lists the package and explicitly requires a published revision for Git installation; the existing CI matrix includes its `npm ci` and `npm test` job. Remote GitHub CI was not part of the local verification run.

## Migration checks

- Passed: the old standalone directory was inspected and its complete eight-file inventory and hashes recorded at `/tmp/codex-theme-move-before.json` before implementation. No symlinks or unexpected files were found.
- Passed: after explicit user approval, the verified package was placed at `/Users/koen/workspace/bb-plugins/bb-plugin-codex-inspired`. No existing checkout files, branch, or Git history were changed. All copied source files matched the task checkout, and `npm ci`, tests, typecheck, SDK pin check, and build passed again at the durable path.
- Passed: the old inventory and complete appearance selection were unchanged immediately before the source switch. `bb plugin install path:/Users/koen/workspace/bb-plugins/bb-plugin-codex-inspired --yes` replaced only the same-ID local registration. BB reported the new source, enabled/running state, and identical active theme, CSS, favicon color, and resolved code theme.
- Passed: native verification used browser-use with a dedicated headless Playwright-managed Chromium 1243 browser, new test profile, and local BB at `http://127.0.0.1:38886`. No login was required. Browser-use's automatic launch failed because its macOS search pattern expects the older `Chromium.app` filename. Setup did not fix that mismatch. Direct CDP connection to the already installed managed Chromium resolved it without changing installed tools or the personal browser session.
- Passed: all four native cases, desktop 1440×1000 and narrow 390×844 with coarse-pointer emulation, each in light and dark mode. The browser's `#bb-app-theme` stylesheet exactly matched the approved CSS in every case. Canvas colors, Inter sidebar fonts, 14px regular thread names, 500-weight unread names and group headings, 16px native-sans messages and composer, monospace code metadata, and larger touch tokens matched expectations.
- Passed: desktop light metrics matched the pre-switch metrics. All four screenshots were inspected. A separate narrow-layout reload confirmed the sidebar belongs to the native dialog; dismissing it exposed a readable chat and a composer with x=16 and width=358 in the 390px viewport.
- Passed: independent contribution ownership was verified through the manifest, no-op backend checks, absence of runtime dependencies or Compose Chat imports, and native `#bb-app-theme` CSS. Compose Chat was not disabled for a separate absence run; no user plugin states were changed for this check.
- Passed: the composer draft remained empty throughout. Owned media, touch, and viewport overrides were cleared and the test client's original Needs attention tab restored. The browser-use session and its owned Chromium process were closed, and the temporary browser profile was removed. Server appearance stayed identical and no Fonts plugin appeared.
- Passed: immediately before deletion, the exact old real path and eight-file inventory still matched the snapshot. The new manifest matched the original parsed manifest, backend source and CSS matched byte-for-byte, and all four native cases had passed. Only `/Users/koen/workspace/bb-plugin-codex-inspired` was removed. Its absence, the new source, running/enabled state, and unchanged full theme selection were verified afterward.
- Not performed: switching other themes, disabling Compose Chat, changing Fonts settings, uninstalling plugins, sending prompts, or changing thread data.

Native measurements are in `/tmp/codex-theme-browser-evidence.json`, with the bounded check script at `/tmp/codex-theme-browser-check.mjs`. Screenshots `/tmp/codex-theme-after-{desktop,narrow}-{light,dark}.png` and `/tmp/codex-theme-after-narrow-chat.png` stay outside Git because they contain live thread and sidebar content. Temporary evidence is not a permanent release artifact.

## Final installation

BB runs enabled plugin `codex-inspired` from `path:/Users/koen/workspace/bb-plugins/bb-plugin-codex-inspired`. The selected theme remains `plugin:codex-inspired:codex-inspired` with default favicon color and byte-identical CSS. No Fonts plugin was found before or after the move. The old standalone directory is absent. The durable package is an untracked addition in the main checkout; root README and CI changes remain in the task worktree for later Git integration.

No commit, push, release tag, marketplace publication, or second-laptop installation was made during verification. Git installation on another laptop requires publishing a repository revision containing this package, then explicit theme selection.

## Completion review

The single fresh-context read-only reviewer compared the complete working-tree change, including untracked files, with baseline `9ac0de87db93bd54fbbcd083c19eeee62e167a01`. It returned no actionable findings and approved the package changes. It correctly reported migration as incomplete at that earlier checkpoint. The subsequently authorized path switch, native checks, cleanup, and updated records are reported above; no executable repository code changed after the review and no second reviewer was run.
