# Compatibility and verification limits

| Component    | Declared/tested boundary                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Node         | 24.15.0 or newer within Node 24                                                                                                          |
| BB           | 0.46.x; build tooling pinned to 0.46.0                                                                                                   |
| Public SDK   | 0.6.37; manifest accepts 0.6.37 through 0.6.x; development and runtime alias pins match                                                  |
| Pi           | Inherited Default install gate: 0.84.0 or newer. Shared speed integration and development type contracts: 1.1.0.                         |
| pi-subagents | Not installed/enabled by this provider. Public RPC v1 and inspection contracts were statically checked at 0.75.0; no live certification. |

Credential-free tests drive the real bridge through a scripted Pi RPC child and use published SDK harnesses. They cover prompts, native tool translation, dynamic tools, model/reasoning choices, select/confirm/input/editor dialogs, native skill roots, checkpoint forks, compaction, process handling, RPC framing, and bridge conformance. They do not prove compatibility with every later Pi release or with a live authenticated model.

The inherited Pi version probe reports a missing or too-old executable before session creation. BB checks the manifest engine ranges. An unavailable package does not affect ordinary Pi work. Observation requires public RPC v1 and snapshot/projection v1. Capture additionally requires the registered inspection command and a handled extension-command disposition (statically checked in Pi 1.0.0). Missing capability has no model fallback. No live package/Pi version is certified for capture, persistence, or idle retention. See [capture boundaries](SUBAGENTS.md).

## Shared Codex speed package

The fork embeds `@koenvg/pi-openai-codex-speed@0.1.0` in its generated extension. The reviewed archive is a package-local development input at `vendor/koenvg-pi-openai-codex-speed-0.1.0.tgz`. Its SHA-256 is `1642307063bd2867eb26e94853fd6906bc135c33161243de953012864b4718ff`. Run `bun run check:codex-speed` to check the generated source; use `bun run update:codex-speed` only when updating that reviewed input. Runtime does not load a pi-plugins sibling checkout or the development package.

Intentional fork-only changes enable native service-tier metadata, add safe private-channel discovery/selection, and carry BB's saved tier through turn and resume dispatch. The shared module owns entitlement checks, the native Codex stream decorator, and final payload validation. Credentials and raw authenticated responses do not cross the bridge. Unavailable speed control permits Default only.

Fixtures exercise the real embedded controller and synthetic accounts. Model `supportedServiceTiers` narrows the provider vocabulary; an empty list hides non-default choices. No new frontend control or DOM override is added. Authorized installed acceptance on BB 0.46.0 showed Default and Fast, no Ultrafast, unchanged model/reasoning, and saved Fast after release/resume. This does not prove backend priority scheduling, billing, or latency.

The approved migration pins SDK 0.6.37 and BB 0.46.x. SDK checks, standalone build, production packaging, and the limited live/installed acceptance passed. However, BB 0.46.0 can mark a reasoning-only edit as an explicit Default after failed discovery. This silently replaces saved Fast. [BBP-201](bbtask://BBP-201) tracks the required host fix; SDK compatibility alone does not establish safe saved-speed behavior. The host fix is local and not installed or published. Do not merge or deploy this feature as complete until that prerequisite is shipped and verified. See [verification](../openspec/changes/openai-codex-speed-options/verification.md) and [the migration report](../BB-0.46-COMPATIBILITY.md).

## SDK packaging on BB 0.46.0

The normal `bb plugin types . --check` gate must pass at SDK 0.6.37 before building. No diagnostic exception applies to this target.

On 2026-10-06, the read-only checker exited 0 at published source `2952bf97d84160d515afc88bdc101c58425c3e7f`, with BB 0.45.0 and both source SDK pins at 0.6.15. [BBP-156](bbtask://BBP-156) resolved this source gate. This result does not change the old checker evidence or certify an installed build.

The canonical `@get-bb/plugin-sdk` pin is a development dependency for public types and test harnesses. Runtime imports use `@get-bb/plugin-sdk-runtime`, an exact npm alias of the same published SDK 0.6.37 package. Only its public `/host` and `/provider-bridge` exports are used. This is not a separate SDK fork. BB bundles those exports into the host and server artifacts. Production installs retain the alias and Zod without development packages.

`production.test.ts` creates a package-local copy, runs `bun install --frozen-lockfile --production --omit=optional --ignore-scripts`, checks the normal gate, builds with BB 0.46.0, and loads the server and host artifacts in Node. It checks all three artifact version records, provider registration, native-roots RPC and an unknown bridge request. The child cannot resolve the canonical SDK. The SDK test harnesses stay outside the production copy. Pi settings and model sessions are not used.

Moving only the canonical SDK to development dependencies is insufficient. BB 0.45.0 cannot build this provider's public host contract without an installed runtime SDK. The production regression keeps that failure covered.

## SDK check limit on BB 0.44.0

This historical exception covers only BB 0.44.0 / SDK 0.5.29. It does not apply to the current 0.46.0 source or its production runtime alias.

Run `bb plugin types . --check` and retain its true exit code and complete output. The operator approved a [provider-only diagnostic exception](../.pi/skills/verify/references/pi-subagents-sdk-exception.md) for the verified case. That reference is authoritative for scope, conditions, replacement evidence, and report rules. That historical source keeps the required SDK in runtime dependencies; the checker remains failed, not fixed or passed.

When every exception condition and replacement check passes, this one accepted diagnostic no longer blocks the next verification step. Installation and live agent tests still need separate approval. At the time of that exception, server activation, installed acceptance, and the actual GitHub CI run were unverified.

## Installed acceptance

On 2026-10-06, [BBP-164](bbtask://BBP-164) records the installed historical `69b1dc9` build as incompatible with BB 0.45.0. This installed build is separate from the passing source above. The BB 0.44.0 / SDK 0.5.29 exception does not cover this incompatibility. Installed acceptance remains incomplete.

No live installed acceptance is claimed by this baseline. Follow the repository [verify skill](../.pi/skills/verify/SKILL.md) before installation, source switches, reloads, or live model tests. Approval must name the target instance and exact source, the final installation state, bounded test threads and paid usage, and cleanup of owned records. Standalone Pi configuration, bundled Pi, defaults, existing sessions, and unrelated records stay unchanged.

The later lifecycle acceptance must establish the actual idle-cleanup deadline and prove that a child outlives it after the parent becomes idle, then delivers its result to that parent. Fixtures, badges, and short runs do not meet that gate.
