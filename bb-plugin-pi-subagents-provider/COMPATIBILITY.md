# Compatibility and verification limits

| Component | Declared/tested boundary |
| --- | --- |
| Node | 24.15.0 or newer within Node 24 |
| BB | 0.44.x; build tooling tested at 0.44.0 |
| Public SDK | 0.5.29; manifest accepts 0.5.29 through 0.5.x |
| Pi | Inherited install gate requires 0.84.0 or newer; fixtures and type contracts use 0.84.0 |
| pi-subagents | Not required or automatically installed/enabled. Observation is unavailable in this baseline. |

Credential-free tests drive the real bridge through a scripted Pi RPC child and use published SDK harnesses. They cover prompts, native tool translation, dynamic tools, model/reasoning choices, select/confirm/input/editor dialogs, native skill roots, checkpoint forks, compaction, process handling, RPC framing, and bridge conformance. They do not prove compatibility with every later Pi release or with a live authenticated model.

The inherited Pi version probe reports a missing or too-old executable before session creation. BB checks the manifest engine ranges. An unavailable subagent package does not affect the ordinary Pi bridge. The settings section reports unavailable observation rather than claiming that a missing package is supported. No subagent version is certified for observation, capture, or idle retention yet.

## SDK check limit on BB 0.44.0

Run `bb plugin types . --check` before activation. BB 0.44.0 reports that the SDK pin matches 0.5.29, but exits 1 because it asks to move the SDK to development dependencies. That generic advice conflicts with BB's published provider-bridge contract, which requires a runtime SDK for production-only managed builds. Keep the SDK in `dependencies`. Do not run the rewriting `bb plugin types` form to silence the warning.

This check remains blocked. Installation must wait for an approved resolution of that checker limitation. Local artifact builds do not synchronize SDK declarations and do not activate the plugin; their manifest and lockfile must remain unchanged. Production-only dependency/build checks are separate evidence, not a passing SDK compatibility check.

## Installed acceptance

No live installed acceptance is claimed by this baseline. Follow the repository [verify skill](../.pi/skills/verify/SKILL.md) before installation, source switches, reloads, or live model tests. Approval must name the target instance and exact source, the final installation state, bounded test threads and paid usage, and cleanup of owned records. Standalone Pi configuration, bundled Pi, defaults, existing sessions, and unrelated records stay unchanged.

The later lifecycle acceptance must establish the actual idle-cleanup deadline and prove that a child outlives it after the parent becomes idle, then delivers its result to that parent. Fixtures, badges, and short runs do not meet that gate.
