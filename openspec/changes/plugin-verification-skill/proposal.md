# Proposal

## Why

Passing a plugin's tests and build does not show that BB loaded the changed checkout or that its installed behavior works. Live checks currently vary by plugin and can miss untested behavior, stale browser state, or the risk of replacing an existing installation.

## What Changes

- Add a reusable `verify` Agent Skill for BB plugin changes, invoked through Pi's `/skill:verify` command or a request to verify a plugin.
- Derive observable checks from the requested change, diff, plugin documentation, and relevant OpenSpec scenarios rather than use one fixed UI checklist.
- Discover and run applicable local tests, type checks, SDK compatibility checks, and a plugin build before installing the changed package.
- Use the current BB instance by default. Confirm the exact installed source, ask before switching an existing plugin's source or taking destructive actions, and preserve unrelated settings and data.
- Use `browser-use` with a dedicated Chrome session instead of Arc. Exercise the actual changed UI and supplement it with CLI, RPC, or host checks where needed.
- Report each required check as passed, failed, or blocked, with evidence. Missing accounts, live data, or browser access must remain visible as coverage gaps.
- Restore temporary settings and owned test data, close only the verification browser session, and report the final installation and cleanup state.

## Capabilities

### New Capabilities

- `plugin-verification`: A repeatable, evidence-based workflow for checking changed BB plugins in their installed runtime while protecting the user's existing setup.

### Modified Capabilities

None.

## Impact

- The skill and planning artifacts live in this repository. Create `.pi/skills/verify/SKILL.md` for project-local discovery, as explicitly requested by the user. Do not create a global copy or distribute a new BB plugin.
- The skill reuses the existing `browser-use`, `bb-cli`, and `bb-plugin-authoring` skills and installed CLI help. No new runtime dependency, plugin API, custom slash-command extension, or browser service is required.
- Later verification runs can build packages, install or reload plugins, and temporarily change the current BB instance. Source switches and destructive actions retain explicit approval gates.
- The first version verifies and reports. It does not repair plugin code, migrate dependencies, publish releases, or start background agents. During integration, the user separately approved updating `bb-plugin-pr-thread-list`'s SDK dependency and lockfile to match the current BB host. This bounded prerequisite does not grant the skill automatic repair authority.
