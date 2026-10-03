# Proposal

## Why

Codex Inspired is installed only from `/Users/koen/workspace/bb-plugin-codex-inspired`, outside this repository. Moving its source here makes the same theme available to another laptop through the repository's normal plugin installation process.

## What Changes

- Add `bb-plugin-codex-inspired/` as an independent theme plugin with the existing identity, compatibility limits, and unchanged approved stylesheet.
- Supply the development files missing from the local release copy, including a lockfile, TypeScript configuration, and automated tests.
- Add the theme to the repository plugin list and existing test workflow. Document Git installation and explicit theme selection.
- Repoint this laptop's existing local-path installation to a verified, durable checkout of this repository without uninstalling the plugin or changing the selected theme.
- Delete the old standalone directory only after the replacement passes package and installed-runtime checks. Keep the old copy if migration fails or its contents change during the move.
- Keep the theme optional and independent of Compose Chat. Do not change palette, typography, Fonts settings, or client light/dark mode.

## Capabilities

### New Capabilities

- `codex-inspired-theme`: A repository-owned, independently selectable Codex Inspired theme that can be installed on another laptop and safely replaces the existing standalone local copy.

### Modified Capabilities

None. The existing CI contract already requires tests for every remaining plugin; this change adds a package to that workflow. Liquid Glass stays retired and the verification workflow is not redesigned.

## Impact

- New package at `bb-plugin-codex-inspired/`, plus the root `README.md` and `.github/workflows/tests.yml`.
- Local BB registration for `codex-inspired` and eventual removal of `/Users/koen/workspace/bb-plugin-codex-inspired`.
- Existing BB requirements remain `>=0.44` and Plugin SDK `>=0.5.29`; no new runtime service, account, font download, or frontend bundle.
- Implementation prepares Git distribution instructions. Committing, pushing, tagging, marketplace publication, and installation on the other laptop require separate user requests and are not part of this proposal workflow.
