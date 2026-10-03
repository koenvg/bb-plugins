# Codex Inspired

A selectable BB theme with a neutral light and dark palette, native system sans for app and chat text, and Inter for the sidebar. Messages and the composer use 16px text. Thread titles use 14px regular text, unread emphasis uses weight 500, and group headings use 14px at weight 500. Code metadata stays monospaced.

Version `0.1.0` requires BB `>=0.44` and Plugin SDK `>=0.5.29`. There is no frontend bundle, runtime dependency, account, font download, or thread-list replacement. Inter comes from BB. Compose Chat is not required.

## Install from Git

Use a published revision containing this package. The commands below work after the package reaches `main`:

```sh
bb plugin install git:https://github.com/koenvg/bb-plugins.git@main --subdirectory bb-plugin-codex-inspired
bb theme show plugin:codex-inspired:codex-inspired --css
```

Installation adds a choice to Settings > Appearance. It does not change your active theme. Select Codex Inspired there or run:

```sh
bb theme set plugin:codex-inspired:codex-inspired
```

BB stores the palette server-side and applies it to all clients. Each client keeps its light or dark preference. Fonts plugin overrides keep their normal precedence. This theme does not change Fonts settings, navigation, project grouping, or thread-list behavior.

## Develop and install locally

Use Node `>=24.15.0 <25`, matching the repository's test workflow. Run these commands in a durable checkout. BB references a local-path plugin in place, so do not use a temporary worktree for a permanent installation.

```sh
cd bb-plugin-codex-inspired
npm ci
npm test
npm run typecheck
bb plugin types --check
npm run build
bb plugin install .
```

Tests need neither BB nor account credentials. Building, SDK pin checking, and installation require a compatible BB CLI. Tests check the approved CSS checksum, manifest paths and identity, package file declarations, and side-effect-free backend activation.

For later source changes, rerun checks and build, then use `bb plugin reload codex-inspired`. To move an existing local installation, build and verify the new package first, then run:

```sh
bb plugin install path:/absolute/path/bb-plugins/bb-plugin-codex-inspired
bb plugin source codex-inspired --json
bb theme show --json
```

Use the same plugin identity; do not uninstall first. Confirm the source path, enabled state, selected theme, and resolved CSS before deleting an old copy. Keep the old directory if any required check fails or is blocked. Stop if its contents or the BB registration changed during the move. The [repository verification record](https://github.com/koenvg/bb-plugins/blob/main/bb-plugin-codex-inspired/ACCEPTANCE.md) records this laptop's migration status after publication. Packed releases do not include that record.

## Selector contract

`themes/codex-inspired.css` preserves the approved stylesheet, SHA256 `98dbfecfba24c5ea129106c4ac3c295c4137f2744451af81e1caf3f87fbc0b61`. Intentional future appearance changes require approval, an updated checksum, and a new version.

The selectors depend on current BB and Threads with PRs markup, not a stable SDK styling API:

- `[data-sidebar="sidebar"]` scopes Inter to the desktop sidebar and responsive drawer.
- `[data-sidebar-thread-id]` sets thread-name anchors to 14px. `.font-semibold` on the same anchor sets unread emphasis to weight 500.
- `[class~="group/header"] .truncate.font-semibold` identifies group headings.
- `[data-message-column]` and `[data-markdown-preview]` set 16px reading text without enlarging navigation or tool logs.
- `form[data-promptbox] [contenteditable="true"]` targets the composer editor. The form retains the approved radius and shadow.
- The narrow coarse-pointer rule retains BB's larger touch typography without changing sidebar width or drawer layout.

Check actual regular and unread thread titles, group headings, code metadata, messages, and the composer in light, dark, and narrow layouts after BB or thread-list upgrades. A fixture alone cannot verify BB's cascade. The CSS has no `!important` declarations or external font references.

## Build and packaging

`npm run build` emits `dist/server.js`, its source map, and SDK/identity metadata. CSS remains a manifest-referenced file. Build before `npm pack`; use `npm pack --dry-run` to inspect the release contents. Generated `dist/` and tarballs are not source files and must not be committed.

The package keeps `server.ts` for Git source installs. The type-only SDK import needs no production dependency. Built backend artifacts also ship in packed releases. Each plugin is versioned independently; no release tag or marketplace publication is needed for direct Git installation.

## Rollback

Switch to BB's default theme before disabling or removing this plugin:

```sh
bb theme set default
```

Disabling the plugin removes its theme choice. Ayu remains a separate theme only when its owning plugin is loaded. The unchanged CSS comment refers to `plugin:ayu:ayu-light`; that is not a bundled rollback dependency.

Compose Chat can use BB's existing color and font tokens without importing this CSS or selecting a theme on activation. Keep chat layout changes separate from this optional palette.
