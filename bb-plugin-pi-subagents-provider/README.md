# Pi with subagents

An independent fork of BB's Pi provider. It registers provider `pi-subagents` alongside bundled `pi` and preserves ordinary Pi work. The source implements native background observation and a read-only Subagents panel with bounded task, transcript, output, parallel/nested structure, and captured-history recovery. Installed lifecycle and persistence acceptance remain unproved; this is not a lifecycle-safety claim.

The package/plugin ID is `bb-plugin-pi-subagents-provider` / `pi-subagents-provider`. It ships server, host, and frontend entries, published dependencies, a committed repository-level Bun lockfile, and the upstream MIT notice. See [UPSTREAM.json](UPSTREAM.json), [local adaptations](UPSTREAM.md), and [compatibility and check limits](COMPATIBILITY.md).

## Local checks

This package is a Bun workspace. Run `bash .bb-env-setup.sh` at the repository root to prepare all local dependencies. Package-local Bun commands also discover the shared root lockfile. The production packaging test uses that root lock with a filtered production-only install.

Use Bun 1.4.3 for installs and scripts, with Node 26.0.0 or newer within Node 26 for Vitest. The package needs no sibling BB packages, running BB server, account, or model credentials for these checks:

```sh
cd bb-plugin-pi-subagents-provider
bun install --frozen-lockfile
bun run test
bun run typecheck
bun run build
```

`bun run test` runs once. It retains upstream regression tests and drives a scripted Pi RPC child, not a paid agent. It also builds and loads a temporary production-only copy with no canonical SDK or development tools installed. `bun run build` uses the pinned published `bb-app@0.46.1` CLI and builds all three artifacts. Build output is in `dist/` and is not committed. Public runtime imports use `@get-bb/plugin-sdk-runtime`, an exact npm alias of SDK 0.6.49, which stays available with `bun install --frozen-lockfile --omit=dev`. The canonical SDK supplies development types and test harnesses. See [production packaging](COMPATIBILITY.md#sdk-packaging-on-bb-0460).

`bun run update:codex-speed`, `bun run check:codex-speed`, and the generator tests require system `tar` with gzip and stdin support. The generator verifies installed package inputs against the pinned archive before bundling the verified archive bytes.

Also run the read-only `bb plugin types . --check` and retain its actual exit code and complete output. The normal current-host gate must pass before building. When updating BB compatibility, synchronize the canonical SDK with `bb plugin types`, update the runtime alias to the same exact version, and rerun all checks. The historical BB 0.44.0 / SDK 0.5.29 exception does not apply. Local checks do not authorize installation or paid tests.

## Install after approval

Installation runs full-trust plugin code. First obtain the approvals and pass the gates in the repository verify skill. No install command below grants paid-test, source-switch, or destructive-cleanup permission. An earlier private-command build failed at startup. The user then approved installing the pre-rebase native-control restoration from this worktree; activation succeeded. The subsequent rebase lifecycle changes and test repair have not been reloaded. Source approval and activation do not establish live acceptance.

From an approved stable local checkout after local checks:

```sh
bb plugin install /absolute/path/to/bb-plugin-pi-subagents-provider
```

After this package is integrated into `main`, the Git-source form is:

```sh
bb plugin install git:https://github.com/koenvg/bb-plugins.git@main --subdirectory bb-plugin-pi-subagents-provider
```

These commands are examples, not actions taken by this task. A thread worktree can expire; use a stable source for retained installations. New fork-provider threads require a user-installed Pi CLI on their host. The inherited provider reports whether Pi is missing or older than 0.84.0. Sign-in happens through Pi on that host. This package does not install Pi or subagents as an install hook.

### Read captured conversations

The run list stays above the selected conversation. Choose a run with the pointer, Enter, Space, ArrowUp, ArrowDown, Home, or End.

Run rows show the agent label, a short distinguishing reference, captured task context and a model name only when captured. Full run IDs stay in Capture details. Selected-run state, duration and model provenance appear once above the reader. Control feedback and disclosure chevrons use short transitions; reduced motion makes them immediate. Conversation content does not animate on refresh.
Task, prose, and final output use BB's public Markdown renderer. Tool calls and results start collapsed; expand a tool to read escaped input or output.
The renderer's `pi-subagents-prose` class is the reading-style hook for task, text messages, and final output only. Codex Inspired uses it to share normal chat's Libron reading typography. Coarse-pointer prose uses 16px primary text; labels, metadata, and escaped tool payloads stay outside that hook.
The final-output button scrolls to and focuses captured output. It is disabled when output is absent.
Selecting the same run or receiving a metadata-only refresh preserves reading position and open tools.

Each run shows execution state, known total duration or elapsed time at observation, and the captured child model/provider when supported.
Model values come from attributed foreground assistant records or the restricted completion-time session reader described in [capture limits](SUBAGENTS.md#restricted-background-model-evidence). Workflow containers, old captures without evidence, and unsupported background cases show Model unavailable.
These values are captured observations, not a live model feed or clock.

The temporary BBP-225 reader for upstream issue #2922 covers only successful direct fresh local single async children observed in the current Pi process generation. It requires distinct executor/run UUIDs, a pre-completion absence probe, and exact indexed completion paths under the host bridge root. Reads are bounded to one 512 KiB session and at most 250 ms within the existing capture deadline. There is no historical backfill. Workflow, nested, external/remote, fork, revival, reused-file, missed-event, unsafe-path, and unsupported-file cases remain unavailable. Source fixtures do not prove installed acceptance or live coverage.

Expand Capture details inside the conversation for observation, capture, model-capture, and failed-attempt times, full IDs, missing-model/task/transcript notices, activity, omissions, and clipped-text notices.
Capture failures retain accepted results and do not change the execution outcome.
The viewer has no execution controls and does not submit a parent turn. View, Data, and theme switches from the prototype are not production controls.
Select **Pi with subagents** for a new thread. Existing bundled-provider threads keep provider `pi` and their session files. This plugin does not change the default provider. It reads Pi's native skill roots as the inherited provider does, without editing Pi settings. Open **Subagents** from the thread panel actions. Missing capabilities show explicit unavailable states. See [capture limits](SUBAGENTS.md).

## OpenAI Codex speed

For the ChatGPT subscription route `openai-codex`, select Default or confirmed Fast in BB's existing model picker, alongside reasoning. BB core and the bundled Pi provider are unchanged. This fork embeds `@koenvg/pi-openai-codex-speed@0.1.0` and verifies Pi 1.1.0. Fast uses the verified `priority` wire value and increased usage. Ultrafast is absent because its wire mapping is unverified. API-key routes and other providers offer no Fast choice.

Known limitation accepted by the user: [BBP-201](bbtask://BBP-201). If discovery fails or revokes Fast, a model or reasoning edit can send BB's displayed fallback Default as an explicit choice and replace saved Fast. Check the speed selection after these edits. Refresh availability and select Fast again if needed. The core fix is not installed and is not a dependency of this revision.

Before Fast dispatch, the BB-managed source renews expired successful capability evidence with one coalesced discovery attempt. This includes tool continuations and expiry during an awaited payload callback. Only fresh, account-confirmed evidence authorizes the final payload.

After discovery fails, use `/speed refresh` for manual recovery or select Default. Cached discovery failures do not trigger automatic retry. Other `/speed` commands fail privately with instructions to use the BB speed selector; they never become model prompts. Start and steer reject attachments before reading them or changing execution settings. A server refusal causes no automatic retry or dispatch downgrade.

BB's native service-tier setting is authoritative and carries the choice through start, resume, model/reasoning rebuilds, and compaction. The removed private-command adapter's `.bb-codex-speed.json` files are neither read nor deleted. Startup no longer publishes or reopens native history before the first model prompt. Pi owns its session writer. Non-default requests still require current account/model confirmation. Speed changes affect subsequent turns; current tool continuations keep their captured speed.

Child sessions retain their own settings. The fork neither installs the standalone extension globally nor changes the bundled Pi provider, credentials, or provider defaults.

## Preserved behavior

Ordinary prompts, native tools, model and reasoning selection, extension dialogs, native skill discovery, checkpoint forks, and manual compaction keep their inherited regression tests. Dialog answers use the public host shortcut hook. The fork never loads or enables `pi-subagents` to make a view available. Standalone Pi still uses its own settings, prompts, packages, and agent definitions.

Fork session files use `~/.bb/pi-subagents-bridge-sessions`, not `~/.bb/pi-bridge-sessions`. A package-private test override is `BB_PI_SUBAGENTS_BRIDGE_SESSION_DIR`; the bundled provider's override is ignored. The inherited host executable overrides `BB_PI_BRIDGE_COMMAND` and JSON-array `BB_PI_BRIDGE_ARGS` still work when set in the host daemon environment. They do not edit Pi configuration.

## Rollback

Select bundled **Pi** for new work. Leave existing fork-provider history in place. Stop or settle owned work before requesting provider disable or removal; disabling a provider can interrupt its sessions. Do not migrate/delete session files, remove another installation, or change provider defaults as a rollback shortcut. No automation is created by this baseline, so there is no schedule to pause.

For an approved local source switch, record the original and intended final path and restore only settings changed by that verification run. Managed removal can delete plugin settings, secrets, and schedules; it requires separate destructive approval.
