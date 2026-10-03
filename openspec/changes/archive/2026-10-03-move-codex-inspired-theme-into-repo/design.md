# Design

## Context

See `proposal.md` for motivation and scope. BB 0.44.0 currently loads `codex-inspired` from `/Users/koen/workspace/bb-plugin-codex-inspired`. The active theme ID is `plugin:codex-inspired:codex-inspired`.

The standalone folder is not a Git checkout. It contains `package.json`, `server.ts`, documentation, `themes/codex-inspired.css`, and built backend artifacts. It lacks a lockfile, TypeScript configuration, tests, and installed development dependencies, although its README describes development commands. No packaging commit was found in the local refs of this repository.

The 3,409-byte stylesheet exactly matches BB's resolved active CSS. Its SHA256 is `98dbfecfba24c5ea129106c4ac3c295c4137f2744451af81e1caf3f87fbc0b61`. The manifest contributes the stylesheet through `bb.themes`. The backend is an empty factory with a type-only SDK import. There is no app entry or runtime dependency.

Other repository plugins have separate manifests, lockfiles, and non-watch test commands. The CI matrix runs `npm ci` and `npm test` with Node `>=24.15.0 <25`, without an installed BB application. The existing CI spec already covers all plugin directories; its older enumerated examples do not list every current package. This change satisfies its general requirement without broad spec cleanup.

## Goals / Non-Goals

**Goals:**

- Make the approved release copy a reproducible source package in this repository.
- Preserve identity so BB's current selection survives the source-path change.
- Make deletion depend on verified replacement, not on successful file copying alone.

**Non-Goals:**

- Redesign the CSS, add a frontend application, or merge the theme into Compose Chat.
- Add a migration service, custom CLI, dependency on another plugin, or font downloads.
- Publish to a marketplace, create release tags, push Git changes, or operate the other laptop during implementation without separate authorization.

## Decisions

### Keep a separate manifest-contributed theme package

Add `bb-plugin-codex-inspired/` with the existing package version `0.1.0`, identities, compatibility floors, no-op backend, and exact stylesheet. Keep assets relative to the package. Rebuild backend artifacts from source instead of copying generated bundles into Git. Retain the package file list needed for release packaging.

This follows the repository's per-directory installation pattern. A loose custom theme would still need manual copying. Putting CSS inside Compose Chat would couple theme selection to chat behavior and could change appearance merely by enabling that plugin.

### Restore only the development files the package needs

Add strict TypeScript configuration, a committed npm lockfile, and focused tests compatible with the repository's supported runtime. Preserve SDK compatibility and include declaration dependencies only where the current SDK requires them. Check the approved CSS hash, theme manifest identity and paths, packaging file availability, and the backend's lack of activation side effects.

Tests run without BB so the package can join the existing CI matrix. Build and installed-runtime checks run separately on the compatible local BB instance. Avoid adding a generic migration framework or changing unrelated plugin dependencies.

### Preserve selection through a same-ID local source replacement

Use BB's supported local-path replacement operation, `bb plugin install path:<durable-repository-package>`, after confirming the exact destination and current registration. Do not run `bb plugin remove`. The plugin and theme IDs remain unchanged, so the source move does not require resetting the active selection.

The preferred durable destination is `/Users/koen/workspace/bb-plugins/bb-plugin-codex-inspired`, once that checkout contains the verified package. Do not overwrite another checkout's branch or uncommitted work to make that path available. If integration cannot be completed within the apply authorization, leave local migration and deletion blocked and report the exact remaining step. Do not install from this disposable thread worktree as the final state.

### Delete the old directory last

Record the standalone folder's complete inventory, file hashes, real path, and BB source before starting the move. Preserve authored files and document which generated files are replaced by reproducible builds. Recheck the inventory and BB registration immediately before deletion. Stop on unexpected files, symlinks, concurrent edits, or a different source registration.

After the replacement passes all checks, delete only the exact old package folder. Recheck BB's source and theme resolution afterward. This is a bounded operator migration, not behavior embedded in the plugin. A delete-first move risks losing the only working copy and breaking an active theme.

## Risks / Trade-offs

- CSS depends on current BB and Threads with PRs markup. Byte equality prevents redesign but does not guarantee compatibility with future versions. Check current light, dark, desktop, and narrow layouts and document the selector limits.
- A disposable worktree can disappear. Keep the final installation on a durable repository checkout; defer deletion if that checkout is unavailable.
- Old folder contents or BB state can change during verification. Recheck both before switching and deleting; do not overwrite concurrent changes.
- Fixtures cannot prove the native CSS cascade. Inspect the installed theme in BB, including thread titles, group headings, messages, and the composer, before deleting the old copy.
- The existing verification spec calls for dedicated Chrome even for authenticated pages. Current operator instructions require browser-use's default browser, or Arc when sign-in is required. Follow those instructions and record the actual browser and this discrepancy; do not revise that separate capability here.
- The repository is not yet published with this package. Documentation must say Git installation on the other laptop requires a published revision containing it; local validation does not prove a remote release exists.

## Migration Plan

1. Snapshot the old package inventory and current BB source, enabled state, active theme, resolved CSS, and favicon color. Observe client preferences without changing Fonts settings or unrelated state.
2. Add the source package and missing development files in this repository. Retain the exact approved CSS and remove local-thread-specific handoff text from installation documentation, without losing useful provenance.
3. Add the README entry, Git installation command with `--subdirectory bb-plugin-codex-inspired`, explicit selection command, and CI matrix entry.
4. Run clean dependency installation, automated tests, typecheck, SDK pin checking, build, and package-content validation. Ensure a clean package needs no old-folder files, absolute paths, or untracked assets.
5. Make the verified package available in the approved durable checkout without overwriting unrelated changes. Recheck both source folders and BB registration, then repoint the existing local plugin to that path.
6. Verify the exact new BB source and runtime, unchanged theme ID and resolved CSS, and appearance in light and dark mode, including the narrow drawer. If temporary client mode changes are needed, restore only those values still matching the test's own writes. Do not send prompts or alter thread data.
7. If any check fails or is blocked, retain the old folder. If a source switch occurred and no other actor changed it, restore the old source and report the failure and final state.
8. After all required checks pass, recheck the deletion guards, remove only the old standalone directory, and verify that BB still resolves the repository source and identical CSS. Report cleanup failures explicitly.

The second laptop can install a published revision with:

```sh
bb plugin install git:https://github.com/koenvg/bb-plugins.git@main --subdirectory bb-plugin-codex-inspired
bb theme set plugin:codex-inspired:codex-inspired
```

Publishing that revision and running these commands on the other laptop are separate operations. Installation adds the choice; the second command selects it.
