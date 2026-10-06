# Upstream baseline

This package imports `get-bb/bb`'s committed `plugins/provider-pi` tree at the exact revision in [UPSTREAM.json](UPSTREAM.json). The tracked branch is `main`. The source came from GitHub's commit archive, not a local checkout. Before adaptation, a recursive comparison found no differences in the provider tree. Only the copied root MIT [LICENSE](LICENSE) was additional. No uncommitted upstream changes were imported.

The imported provider was version 0.1.0, with SDK 0.5.24 and Pi types/fixtures 0.84.0. The initial standalone package pinned SDK 0.5.29 and build CLI 0.44.0. The current package pins SDK 0.6.15 and build CLI 0.45.0; see [compatibility and runtime packaging](COMPATIBILITY.md). The lockfile records npm package integrity. These are deliberate pins, not an automatic update policy.

## Local adaptations

- Package/plugin identity is `bb-plugin-pi-subagents-provider` / `pi-subagents-provider`. Provider identity is `pi-subagents`, displayed as `Pi with subagents`.
- Extension dialogs use `pi-subagents-provider/extension-ui`. Inherited fixture expectations use the new provider identity.
- Session files default to `~/.bb/pi-subagents-bridge-sessions`. The fork uses `BB_PI_SUBAGENTS_BRIDGE_SESSION_DIR`, never the bundled provider's session override. Scratch files already use the bridge's process-private or plugin-scoped temporary directory.
- Workspace dependencies and sibling path aliases are removed. The canonical SDK is a development dependency. Its exact production npm alias, `@get-bb/plugin-sdk-runtime`, provides the public host and provider-bridge exports for BB's bundles. Both SDK pins must match. Zod stays in production dependencies. Published `bb-app` supplies standalone build tooling in development dependencies.
- Dialog answer shortcuts use the public `experimental_useQuestionFormHost` hook. A small package-owned button replaces the private BB button. Other inherited dialog behavior remains unchanged.
- A settings section states that subagent observation is unavailable. There are no child controls, polling, lifecycle translation, inspection commands, or timers in this baseline. Missing or disabled subagents do not block ordinary prompts.
- The inherited `skills/` source is retained for comparison but `bb.skills: []` prevents this fork from injecting duplicate bundled-provider instructions into all threads. Native Pi skill discovery is unchanged.
- Inherited tests remain in the package. New registration/storage/package tests cover separation and production dependencies. The public-import scanner permits one exact computed import in the inherited fake child, which loads the bridge-supplied extension file. No production import is exempt.
- `README.md`, compatibility guidance, overview, repository catalog entry, and CI matrix entry describe the standalone fork. Internal `prepare:bundled` tooling is removed.

## Integration points for later tickets

Keep subagent observation behind its own module. The existing `ExtensionUiCoordinator.handle` receives structured widgets and dialogs; `PiRpcSession` owns the correlated `PiRpcChild`; `bb-pi-extension.ts` supplies the existing process-local tool channel; `bridge.ts` owns session construction/disposal; `PiDeltaTranslator` emits native deltas. These are attachment points, not completed subagent behavior. Keep unrelated dialogs and ordinary turn boundaries unchanged.

Later observation/capture work can replace the unavailable settings section and declare schema-validated extension state. This baseline creates no native background tasks and offers no retention or completion-wake guarantee. Later monitoring work can consume the recorded branch, revision, and watched paths. It must not advance the import revision merely after checking upstream.

## Deliberate upstream updates

Download a committed revision outside this package. Compare the provider and watched contracts. Review the local adaptations, run the standalone regression suite and approved installed checks, then update the provenance record only after incorporating that revision. Preserve attribution. No updater, schedule, dependency automation, upstream push, or upstream merge is part of this package.
