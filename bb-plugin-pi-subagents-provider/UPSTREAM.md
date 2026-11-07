# Upstream baseline

This package imports `get-bb/bb`'s committed `plugins/provider-pi` tree at the exact revision in [UPSTREAM.json](UPSTREAM.json). The tracked branch is `main`. The source came from GitHub's commit archive, not a local checkout. Before adaptation, a recursive comparison found no differences in the provider tree. Only the copied root MIT [LICENSE](LICENSE) was additional. No uncommitted upstream changes were imported.

The imported provider was version 0.1.0, with SDK 0.5.24 and Pi types/fixtures 0.84.0. The initial standalone package pinned SDK 0.5.29 and build CLI 0.44.0. The current package pins SDK 0.6.132 and build CLI 0.49.0. See [compatibility and runtime packaging](COMPATIBILITY.md). The lockfile records npm package integrity. These are deliberate pins, not an automatic update policy.

## Local adaptations

- Package/plugin identity is `bb-plugin-pi-subagents-provider` / `pi-subagents-provider`. Provider identity is `pi-subagents`, displayed as `Pi with subagents`.
- Codex subscription speed uses a reviewed, version-pinned shared Pi package embedded in the fork's private extension. Native service-tier controls receive explicit per-model narrowing. Prompt, steer, queued follow-up, and resumed-session dispatch validate the saved preference in the running child. Other routes, the bundled provider, provider defaults, and credentials are unchanged.
- BB generation changes only the shared `SpeedError` recovery message, using the native BB Default selector instead of standalone `/speed default`. The pinned archive is unchanged. The generator requires one exact constructor match and leaves capability, payload-guard, and transport logic unchanged. This covers native-stream failures before Pi converts exceptions to strings, as well as private replies and settlement.
- Extension dialogs use `pi-subagents-provider/extension-ui`. Inherited fixture expectations use the new provider identity.
- Session files default to `~/.bb/pi-subagents-bridge-sessions`. The fork uses `BB_PI_SUBAGENTS_BRIDGE_SESSION_DIR`, never the bundled provider's session override. Scratch files already use the bridge's process-private or plugin-scoped temporary directory.
- Workspace dependencies and sibling path aliases are removed. The canonical SDK is a development dependency. Its exact production npm alias, `@get-bb/plugin-sdk-runtime`, provides the public host and provider-bridge exports for BB's bundles. Both SDK pins must match. Zod stays in production dependencies. Published `bb-app` supplies standalone build tooling in development dependencies.
- Dialog answer shortcuts use the public `experimental_useQuestionFormHost` hook. A package-owned button replaces the private BB button. Long titles retain their full text in the payload while the card title respects BB's 160-character limit. Successful answers remain locked until the host removes the card; failed answers can be retried.
- Read-only subagent observation, native background-task translation, bounded capture and history recovery live behind package-owned modules. The settings section describes these limits. Missing or disabled subagents do not block ordinary prompts. See [SUBAGENTS.md](SUBAGENTS.md).
- The inherited `skills/` source is retained for comparison but `bb.skills: []` prevents this fork from injecting duplicate bundled-provider instructions into all threads. Native Pi skill discovery is unchanged.
- Inherited tests remain in the package. New registration/storage/package tests cover separation and production dependencies. The public-import scanner permits one exact computed import in the inherited fake child, which loads the bridge-supplied extension file. No production import is exempt.
- `README.md`, compatibility guidance, overview, repository catalog entry, and CI matrix entry describe the standalone fork. Internal `prepare:bundled` tooling is removed.

## Current integration boundaries

`ExtensionUiCoordinator.handle` receives widgets and dialogs. `PiRpcSession` owns the child and run settlement. `PiSessionChannel` owns correlated extension reports; `PiSessionInputs` owns input acknowledgement. `bridge.ts` owns construction, disposal and native-turn accounting. Observation and capture stay in `src/bridge/subagents`. Pure command, edit and image shapes live in `pi-tool-shapes.ts`; `PiAssistantStreams` owns assistant-message/reasoning stream state and reset policy; the translator retains bounded tool-event bookkeeping.

## Draft package-level synchronization

The draft compares upstream `plugins/provider-pi` at incorporated revision `fdd3de3b19b97e6cd1ef7300cbb54711431249d3`, this fork at `3a69193b1cd835bf4837398c216cb96fdc90010f`, and [upstream main at `e61446e1`](https://github.com/get-bb/bb/commit/e61446e15a0bb3e6df551e45c3aba5c5187ffad3). `UPSTREAM.json` keeps the incorporated baseline unchanged until the draft is accepted. The [path accounting](verification/upstream-e61446e1-draft.md) records all 50 upstream changes and the fork-specific resolutions.

Ports cover authoritative settlement and checkpoints, compaction queuing, exact model selection and catalog refresh, cwd relocation, assistant-message completion, edit batches, image results, cache-TTL metadata, recursive skill roots, local-only installation probes and static provider identity. The native composer matcher accepts both the older extra-count label and the current total-count badge. Compatibility tests retain the fork's speed and capture safeguards.

The draft retains SDK/runtime alias 0.6.132, BB tooling 0.49.0, Pi contracts 1.1.0 and all other dependency pins and engine ranges. It ports the authenticated socket channel, public portable-process and host-process APIs, launcher and managed-install detection, graceful fork shutdown, image attachment fallbacks, retry-stream separation, and structured error categories. Pi 1.1.0 error-message patterns are retained locally under their MIT license so production builds still omit Pi development dependencies. Upstream's private shared QuestionForm, workspace aliases, bundled preparation, compiler change and blanket test removals are not copied. The fork keeps its public question-host hook, controls, bounded observation/capture, and Codex speed guards. Source checks and independent review remain separate from installed acceptance. No installed retention, delivery, parent wake or reload guarantee follows from these ports.

## Deliberate upstream updates

Download a committed revision outside this package. Compare the provider and watched contracts. Review the local adaptations, run the standalone regression suite and approved installed checks, then update the provenance record only after incorporating that revision. Preserve attribution. No updater, schedule, dependency automation, upstream push, or upstream merge is part of this package.
