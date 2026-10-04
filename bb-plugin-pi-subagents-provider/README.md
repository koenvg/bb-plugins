# Pi with subagents

An independent fork of BB's Pi provider. It registers provider `pi-subagents` alongside bundled `pi`. This baseline preserves ordinary Pi work. Subagent observation, captured results, native background retention, and upstream monitoring belong to later tickets and are not available yet.

The package/plugin ID is `bb-plugin-pi-subagents-provider` / `pi-subagents-provider`. It ships server, host, and frontend entries, published dependencies, a committed npm lockfile, and the upstream MIT notice. See [UPSTREAM.json](UPSTREAM.json), [local adaptations](UPSTREAM.md), and [compatibility and check limits](COMPATIBILITY.md).

## Local checks

Use Node 24.15.0 or newer within Node 24. The package needs no sibling BB packages, running BB server, account, or model credentials for these checks:

```sh
cd bb-plugin-pi-subagents-provider
npm ci
npm test
npm run typecheck
npm run build
```

`npm test` runs once. It retains upstream regression tests and drives a scripted Pi RPC child, not a paid agent. `npm run build` uses the pinned published `bb-app` CLI and builds all three artifacts. Build output is in `dist/` and is not committed. The public provider-bridge SDK and Zod stay available with `npm ci --omit=dev`.

Also run the read-only `bb plugin types . --check` and retain its actual result and exact output. The [operator-approved provider-only exception](../.pi/skills/verify/references/pi-subagents-sdk-exception.md) defines when replacement evidence permits the next verification step. It is not installation or paid-test approval. Keep the required runtime SDK; do not use the rewriting command.

## Install after approval

Installation runs full-trust plugin code. First obtain the approvals and pass the gates in the repository verify skill. No install command below grants paid-test, source-switch, or destructive-cleanup permission. This implementation has not installed, enabled, or reloaded the provider.

From an approved stable local checkout after local checks:

```sh
bb plugin install /absolute/path/to/bb-plugin-pi-subagents-provider
```

After this package is integrated into `main`, the Git-source form is:

```sh
bb plugin install git:https://github.com/koenvg/bb-plugins.git@main --subdirectory bb-plugin-pi-subagents-provider
```

These commands are examples, not actions taken by this task. A thread worktree can expire; use a stable source for retained installations. New fork-provider threads require a user-installed Pi CLI on their host. The inherited provider reports whether Pi is missing or older than 0.84.0. Sign-in happens through Pi on that host. This package does not install Pi or subagents as an install hook.

Select **Pi with subagents** for a new thread. Existing bundled-provider threads keep provider `pi` and their session files. This plugin does not change the default provider. It reads Pi's native skill roots as the inherited provider does, without editing Pi settings. Its settings section reports unavailable subagent observation.

## Preserved behavior

Ordinary prompts, native tools, model and reasoning selection, extension dialogs, native skill discovery, checkpoint forks, and manual compaction keep their inherited regression tests. Dialog answers use the public host shortcut hook. The fork never loads or enables `pi-subagents` to make a view available. Standalone Pi still uses its own settings, prompts, packages, and agent definitions.

Fork session files use `~/.bb/pi-subagents-bridge-sessions`, not `~/.bb/pi-bridge-sessions`. A package-private test override is `BB_PI_SUBAGENTS_BRIDGE_SESSION_DIR`; the bundled provider's override is ignored. The inherited host executable overrides `BB_PI_BRIDGE_COMMAND` and JSON-array `BB_PI_BRIDGE_ARGS` still work when set in the host daemon environment. They do not edit Pi configuration.

## Rollback

Select bundled **Pi** for new work. Leave existing fork-provider history in place. Stop or settle owned work before requesting provider disable or removal; disabling a provider can interrupt its sessions. Do not migrate/delete session files, remove another installation, or change provider defaults as a rollback shortcut. No automation is created by this baseline, so there is no schedule to pause.

For an approved local source switch, record the original and intended final path and restore only settings changed by that verification run. Managed removal can delete plugin settings, secrets, and schedules; it requires separate destructive approval.
