# Proposal

## Why

Pi and the Pi with subagents BB plugin do not expose the OpenAI Codex speed tiers available to the signed-in ChatGPT account. Users need to select supported speed tiers without seeing options their subscription or selected model cannot use.

## What Changes

- Add account-aware Default, Fast, and Ultrafast selection for `openai-codex` in standalone Pi and BB's `pi-subagents` provider.
- Show each non-default option only when the active Pi account's model capability response advertises it. Missing or failed discovery does not grant access. The current account advertises Fast, not Ultrafast.
- Keep speed independent from reasoning effort and preserve the selected speed across session or thread resume when it remains available.
- Hide this plugin's native service-tier selector. Use private `/speed` status, selection, and refresh commands with separate preference storage. Standalone Pi retains its own command and picker; no new BB panel is added.
- Share account-capability discovery and request-tier mapping between the Pi extension and this provider's bridge. Do not use another account's Codex CLI cache as entitlement evidence.
- Keep the bundled BB Pi provider, BB core, and other model routes unchanged. Do not disable providers or change defaults as part of this change.

## Capabilities

### New Capabilities

- `openai-codex-speed`: Account- and model-aware speed discovery, selection, persistence, validation, and request dispatch in standalone Pi and the Pi with subagents BB provider.

### Modified Capabilities

None. Existing subagent observation and lifecycle requirements remain unchanged.

## Impact

- Planning home and BB work owner: **bb-plugins**, `proj_gjz4e6jtmg`, this repository. Target: `bb-plugin-pi-subagents-provider`, provider ID `pi-subagents`.
- Standalone extension and shared package work owner: **pi-plugins**, `proj_76wa88nbfm`, `/Users/koen/workspace/pi-plugins`. Its implementation must run in that BB project, not as an unscoped edit from this change's repo-local apply.
- Affected BB boundaries: `src/declaration.ts`, `src/model-list.ts`, `src/session-params.ts`, and the catalog, session, and generated-extension bridge; related tests and compatibility documentation.
- Add an independently installable Pi speed package in the pi-plugins repository and a pinned, distributable dependency for the BB plugin. Preserve the existing token-audit package.
- No work is assigned to the **BB** project, `proj_6a7gh27yiy`. The bundled `provider-pi` is explicitly excluded.
- Verify the OpenAI account-specific model response and wire mapping before advertising either speed tier. This planning work changes no code, installed configuration, credentials, providers, or task-tracker state.
