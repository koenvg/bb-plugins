# Tasks

## 1. Preserve the source package and appearance

- [x] 1.1 Record the old directory's real path, complete file inventory and hashes, and BB's current source, enabled state, theme ID, resolved CSS, and favicon color. Verify the standalone stylesheet matches SHA256 `98dbfecfba24c5ea129106c4ac3c295c4137f2744451af81e1caf3f87fbc0b61`; stop on a different source or unexpected contents.
- [x] 1.2 Add `bb-plugin-codex-inspired/` with the existing manifest identities, compatibility floors, no-op backend, exact CSS, and useful package documentation. Verify the CSS with a byte comparison against the snapshot and confirm generated `dist/` artifacts are not added to Git.
- [x] 1.3 Add strict TypeScript configuration, necessary development dependencies, and a committed lockfile. Verify `npm ci` and `npm run typecheck` work with the repository's supported Node version and no runtime dependency on the old folder.
- [x] 1.4 Add automated tests for the approved CSS checksum, manifest theme identity and relative file paths, and side-effect-free backend activation. Verify `npm test` runs once without BB installed or credentials and rejects an altered stylesheet or invalid manifest path.
- [x] 1.5 Update the package README and overview with optional selection, compatibility and selector limits, reproducible development commands, packaging contents, and safe same-ID source replacement. Remove stale thread handoff and missing-source claims; verify documentation agrees with the manifest and implemented commands.

## 2. Integrate repository distribution

- [x] 2.1 Add Codex Inspired to the root plugin table and document Git installation with `--subdirectory bb-plugin-codex-inspired` plus explicit theme selection. Verify all new directory links and clarify that remote installation requires a published revision containing the package.
- [x] 2.2 Add the package to the existing CI matrix without changing other jobs or requiring BB in CI. Verify it has a committed lockfile and run the CI-equivalent `npm ci` and `npm test` locally in a clean package copy.
- [x] 2.3 Run SDK pin checking, typecheck, and `bb plugin build`; inspect the built backend metadata and release file list with `npm pack --dry-run`. Verify the manifest, backend artifacts, and theme CSS are included and no runtime path points to the old directory or task worktree.

## 3. Migrate this laptop and remove the old copy

- [x] 3.1 Resolve and confirm a durable package path in this repository, preferably `/Users/koen/workspace/bb-plugins/bb-plugin-codex-inspired`, containing the verified source. Check the destination's Git state and file hashes; do not overwrite unrelated checkout work or install from a disposable worktree. Report migration as blocked if safe integration requires separate Git authorization.
- [x] 3.2 Recheck the old inventory and current BB registration, then replace only the existing `codex-inspired` local source through `bb plugin install path:<approved-durable-package>`. Verify `bb plugin source codex-inspired --json`, plugin runtime status, and `bb theme show --json` report the new source, original enabled state and selected theme, and identical resolved CSS; do not uninstall first.
- [x] 3.3 Verify the installed native theme in light and dark mode, desktop sidebar and narrow drawer, messages, and composer, including independence from Compose Chat without disabling the user's other plugins. Record actual browser and evidence, restore owned temporary preferences, and verify Fonts settings, favicon color, and unrelated state remain unchanged. Retain the old copy and restore the old source when safe if any required check fails or is blocked.
- [x] 3.4 After all required checks pass, recheck old-directory identity, hashes, unexpected files, and current BB source. Remove only `/Users/koen/workspace/bb-plugin-codex-inspired`; verify its absence and that BB still resolves the new durable source and identical theme CSS. Stop on concurrent changes and report failed deletion as incomplete cleanup.
- [x] 3.5 Record the package checks, installed-runtime observations, migration and cleanup outcomes, final BB source, enabled state, and remaining publication steps in the package acceptance record. Verify every required check is marked passed, failed, or blocked and do not claim a published release or second-laptop installation without evidence.
