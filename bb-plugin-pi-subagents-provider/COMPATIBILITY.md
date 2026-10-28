# Compatibility and verification limits

| Component    | Declared/tested boundary                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Node         | 26.0.0 or newer within Node 26                                                                                                           |
| BB           | 0.47.1 through 0.47.x; build tooling pinned to 0.47.1                                                                                    |
| Public SDK   | 0.6.79; manifest accepts 0.6.79 through 0.6.x; development and runtime alias pins match                                                  |
| Pi           | Inherited Default install gate: 0.84.0 or newer. Shared speed integration and development type contracts: 1.1.0.                         |
| pi-subagents | Not installed/enabled by this provider. Public RPC v1 and inspection contracts were statically checked at 0.75.0; no live certification. |

Credential-free tests drive the real bridge through a scripted Pi RPC child and use published SDK harnesses. They cover prompts, native tool translation, dynamic tools, model/reasoning choices, select/confirm/input/editor dialogs, native skill roots, checkpoint forks, compaction, process handling, RPC framing, and bridge conformance. They do not prove compatibility with every later Pi release or with a live authenticated model.

## Release compatibility checks

The normal CI suite uses the committed dependency pins. The [latest-release workflow](../.github/workflows/pi-compatibility.yml) runs daily, on relevant pull requests, and on manual dispatch. In a disposable checkout, it installs the latest published BB. It reads `builtWith.pluginSdkVersion` from BB's built-in plugin build metadata and requires one distinct string version. It installs that exact canonical SDK version and the matching runtime SDK alias. Candidate setup, declared engine ranges, exact pins, CLI version, official `types --check`, TypeScript, the complete package suite including production coverage, and all three build artifacts remain blocking. CI artifacts retain individual check logs, exit codes, candidate versions, and the dependency diff.

A newer release outside the declared ranges requires a support review, even when the source checks pass. A separate metadata query records the independently latest published SDK without installing it. A version mismatch or lookup failure is advisory and does not affect the blocking checks. The always-run summary and retained artifacts show the candidate SDK, latest published SDK when available, exact query exit code, and `matched`, `different`, or `unavailable` status. The workflow never changes source pins or engine ranges, promotes dependencies, installs the plugin into a running BB instance, or starts model sessions. A successful source check does not establish installed lifecycle acceptance. Scheduled checks begin only after the workflow reaches the repository's default branch.

The inherited Pi version probe reports a missing or too-old executable before session creation. BB checks the manifest engine ranges. An unavailable package does not affect ordinary Pi work. Observation requires public RPC v1 and snapshot/projection v1. Capture additionally requires the registered inspection command and a handled extension-command disposition (statically checked in Pi 1.0.0). Missing capability has no model fallback. No live package/Pi version is certified for capture, persistence, or idle retention. See [capture boundaries](SUBAGENTS.md).

## Shared Codex speed package

The fork embeds `@koenvg/pi-openai-codex-speed@0.1.0` in its generated extension. The reviewed archive is a package-local development input at `vendor/koenvg-pi-openai-codex-speed-0.1.0.tgz`. Its SHA-256 is `1642307063bd2867eb26e94853fd6906bc135c33161243de953012864b4718ff`. Run `bun run check:codex-speed` to check the generated source; use `bun run update:codex-speed` to regenerate it from that input and the guarded BB build profile. Runtime does not load a pi-plugins sibling checkout or the development package.

Fork-only changes restore BB's existing model-picker speed controls for `pi-subagents`. Provider vocabulary is Default/Fast; only account-confirmed Codex models expose Fast. The shared module retains entitlement checks, native transport, captured-turn speed, and final payload validation. Generated BB recovery text points to Default in the BB speed selector or `/speed refresh`. The build profile also renews expired successful snapshots before dispatch, while cached discovery errors remain sticky. Each payload check permits one coalesced discovery attempt, not a retry loop. All account, token, generation, expiry, and final-payload checks remain. The reviewed archive and its hash pin are unchanged. A server refusal causes no automatic retry or downgrade. Credentials and raw authenticated responses stay Pi-private.

The user accepted [BBP-201](bbtask://BBP-201) as a known limitation. After failed or revoked discovery, a model or reasoning edit can replace saved Fast with BB's displayed fallback Default. BB core is unchanged and its fix is not installed. This is an accepted execution-input ambiguity, not permission to send an unconfirmed non-default tier or downgrade after a server refusal.

The private preference/publish/reopen path was removed. This removes the startup session replacement associated with [BBP-208](bbtask://BBP-208). Existing private preference files and native history are not migrated or deleted. Only `/speed refresh` remains a supported control command; all other speed commands are rejected before reconciliation or attachment reads. Fixtures cover first native-message persistence and resume with a real unflushed Pi SessionManager, zero startup `switch_session` calls, and the accepted fallback path.

Earlier native-selector live acceptance is historical evidence, not acceptance of the restored build. The historical private-command installed attempt failed at startup with a stale extension context and zero model requests. The user then approved installing the pre-rebase native restoration from this worktree. Activation confirmed Default/Fast provider support; retained host SHA-256 is `9d527872118587b9ceb99ffad09a690ceb5c254f8793f7830082410c24609f9e`. Subsequent main lifecycle integration and the fixture repair had not been reloaded at that point. One fresh independent review approved the current source with a non-blocking documentation finding, corrected by the parent. Renewed installed/live acceptance remains required. See [verification](../openspec/changes/archive/2026-10-14-openai-codex-speed-options/verification.md).

The expiry fix has bounded installed acceptance. A fresh `openai-codex/gpt-6.1-sol` Fast turn completed after a 310-second foreground tool wait without refresh or a speed change. See the [speed expiry verification](../verification/pi-subagents/speed-expiry.md) for the artifact identity, event evidence, and remaining limits.

## SDK packaging on BB 0.47.1

The normal `bb plugin types . --check` gate must pass at SDK 0.6.79 before building. No diagnostic exception applies to this target.

On 2026-10-06, the read-only checker exited 0 at published source `2952bf97d84160d515afc88bdc101c58425c3e7f`, with BB 0.45.0 and both source SDK pins at 0.6.15. [BBP-156](bbtask://BBP-156) resolved this source gate. This result does not change the old checker evidence or certify an installed build.

The canonical `@get-bb/plugin-sdk` pin is a development dependency for public types and test harnesses. Runtime imports use `@get-bb/plugin-sdk-runtime`, an exact npm alias of the same published SDK 0.6.79 package. Only its public `/host` and `/provider-bridge` exports are used. This is not a separate SDK fork. BB bundles those exports into the host and server artifacts. Production installs retain the alias and Zod without development packages.

`production.test.ts` creates a package-local copy, runs `bun install --frozen-lockfile --production --omit=optional --ignore-scripts`, checks the normal gate, builds with BB 0.47.1, and loads the server and host artifacts in Node. It checks all three artifact version records, provider registration, native-roots RPC and an unknown bridge request. The child cannot resolve the canonical SDK. The SDK test harnesses stay outside the production copy. Pi settings and model sessions are not used.

Moving only the canonical SDK to development dependencies is insufficient. BB 0.45.0 cannot build this provider's public host contract without an installed runtime SDK. The production regression keeps that failure covered.

## SDK check limit on BB 0.44.0

This historical exception covers only BB 0.44.0 / SDK 0.5.29. It does not apply to the current 0.47.1 source or its production runtime alias.

Run `bb plugin types . --check` and retain its true exit code and complete output. The operator approved a [provider-only diagnostic exception](../.pi/skills/verify-bb-plugins/references/pi-subagents-sdk-exception.md) for the verified case. That reference is authoritative for scope, conditions, replacement evidence, and report rules. That historical source keeps the required SDK in runtime dependencies; the checker remains failed, not fixed or passed.

When every exception condition and replacement check passes, this one accepted diagnostic no longer blocks the next verification step. Installation and live agent tests still need separate approval. At the time of that exception, server activation, installed acceptance, and the actual GitHub CI run were unverified.

## Installed acceptance

On 2026-10-06, [BBP-164](bbtask://BBP-164) records the installed historical `69b1dc9` build as incompatible with BB 0.45.0. This installed build is separate from the passing source above. The BB 0.44.0 / SDK 0.5.29 exception does not cover this incompatibility. Installed acceptance remains incomplete.

No live installed acceptance is claimed by this baseline. Follow the repository [verify skill](../.pi/skills/verify-bb-plugins/SKILL.md) before installation, source switches, reloads, or live model tests. Approval must name the target instance and exact source, the final installation state, bounded test threads and paid usage, and cleanup of owned records. Standalone Pi configuration, bundled Pi, defaults, existing sessions, and unrelated records stay unchanged.

The later lifecycle acceptance must establish the actual idle-cleanup deadline and prove that a child outlives it after the parent becomes idle, then delivers its result to that parent. Fixtures, badges, and short runs do not meet that gate.
