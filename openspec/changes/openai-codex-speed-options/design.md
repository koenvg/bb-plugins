# Design

## Approved native-picker restoration

The user approved restoring Default and account-confirmed Fast in BB's existing model picker, alongside reasoning. No custom header menu or BB core change is required. The user accepts BBP-201: after failed or revoked discovery, a model or reasoning edit can make BB send displayed fallback Default as explicit, clearing saved Fast. This exception is limited to BB execution-input intent. Entitlement checks and final payload guards remain mandatory, and a server refusal never causes automatic downgrade or retry.

BB's native service-tier setting is authoritative. The adapter carries it through construction, subsequent turns, steering, resume, and compaction. Separate sessions retain their own settings. Unverified Ultrafast is absent from provider vocabulary and model options. The shared controller, native transport, and immutable running-turn choice are retained.

Only `/speed refresh` remains supported. Other commands in the `/speed` family fail privately with native-selector guidance. Structured control classification remains before execution reconciliation, skill expansion, or attachment reads for both start and steer. All attachments are rejected, independent of order. Controls never replace a held child or become model prompts.

The prior private-command revision is superseded. Its sidecar preference storage and pre-prompt identity publication/reopen are removed. Pi owns first-message publication and session writing; startup no longer invokes `switch_session` for speed initialization. Existing sidecars and history are left untouched. This removes the startup replacement associated with BBP-208 without mutating private writer fields. Native first-message persistence and resume are tested through the public SessionManager.

The rejected header prototype is retained outside the source tree in `/tmp/bb-native-speed-restoration-wmheh36xv4/rejected-header-prototype.html`. Earlier private-command review findings and installed failure remain historical evidence. Source work does not authorize reloading the installed provider, live requests, publication, or changes to standalone Pi.

## Context

See [proposal.md](proposal.md) for motivation and project ownership, and [the capability spec](specs/openai-codex-speed/spec.md) for behavior.

Observed implementation:

- `bb-plugin-pi-subagents-provider/src/declaration.ts` registers `pi-subagents` and declares `supportsServiceTier: true` with Default/Fast vocabulary.
- `src/model-list.ts` exposes only confirmed Fast for Codex models, preserving model/reasoning choices. `src/session-params.ts` carries speed separately from reasoning.
- `src/bridge/catalog.ts` starts a workspace-scoped Pi RPC child with the generated extension, queries `get_available_models`, and reads model scope over the existing private channel.
- `src/bridge/bb-pi-extension.ts` already serves private channel requests and has a Pi session context. `src/bridge/rpc-session.ts` owns turn dispatch and the channel. These are the integration points, not BB core.
- BB's native selector cannot distinguish intentional Default from the BB 0.46 display fallback. The user accepts this known limitation rather than add a core update or custom control.
- Pi 1.1.0 exposes native provider registration, active-auth resolution, session entries, command registration, and payload instrumentation. Its native Codex transport can send `service_tier`.
- Pi's `before_provider_request` runner catches handler exceptions and continues. An exception in that event alone is not a reliable dispatch guard.
- The inspected Codex CLI account cache advertises Fast with wire ID `priority` and no Ultrafast. It proves the data shape for that CLI account, not the entitlements of Pi's active account. Pi's ordinary static model catalog is also not entitlement evidence.
- `/Users/koen/workspace/pi-plugins` currently contains the token-audit package. Keep it intact and add an independently installable speed package rather than rename it or make a local sibling checkout a runtime requirement.

The proposal is owned by bb-plugins. Implementation of the Pi package belongs to the separate pi-plugins BB project. This repository's local apply does not authorize edits there.

## Goals / Non-Goals

**Goals:**

- One shared account-capability and dispatch implementation used by two small adapters.
- A real pre-dispatch guard with the existing Codex transport, OAuth handling, streaming, and usage accounting preserved.
- Account-aware native BB speed controls and a small standalone Pi command that do not create model turns.
- A self-contained BB plugin build and an independently installable Pi package.

**Non-Goals:**

- Changes to BB core, its bundled `provider-pi`, OpenAI API-key routes, Copilot, provider defaults, or provider enablement.
- A provider fork beyond the existing `pi-subagents` plugin, a copied Codex transport, a custom BB speed panel, or speed encoded as reasoning/model aliases.
- New child-session speed inheritance, automatic tier fallback, repeated network retry, background polling, or subscription inference from plan names.
- Publishing, installing, or changing user configuration during planning.

## Decisions

### 1. Keep project ownership explicit

The independently installable package will live at `packages/openai-codex-speed` in the pi-plugins repository. BB integration stays under `bb-plugin-pi-subagents-provider` in this repository. The package must be released or supplied as a versioned artifact before BB consumes it. Use a pinned distributable dependency, not a committed `file:/Users/koen/...` dependency.

`tasks.md` labels the owner of every work group. Execute pi-plugins work in that BB project under its own instructions and authorized environment. Do not spawn workers, create tickets, or edit that repository from this planning turn. The BB project has no work in this change.

Alternative: put everything in BB core. Rejected because the user targets this installed plugin, not the bundled provider.

### 2. Hide account and wire details in one shared module

The package exposes an extension entry and a small controller interface for reading safe supported tiers, selecting a tier, and installing guarded request handling. Internally it resolves the active Pi OAuth account, reads the account-specific Codex model capability response, normalizes recognized tiers, and owns the mapping to wire values. Callers do not read credential files or interpret raw response fields.

Use Pi's supported active-auth resolution from the running Pi model runtime. Do not start a separate credential store or substitute the Codex CLI account. Tests supply authentication and HTTP adapters at this module's interface. Tokens and identity information stay in the Pi process; only normalized tiers, safe descriptions, and error categories cross the BB channel.

Fast maps to the verified `priority` wire ID. Ultrafast is recognized only when both account/model availability and its wire mapping are verified. A response string or a provider-wide label alone cannot authorize it. Add sanitized protocol fixtures and confirm the account model-list request contract against the supported Codex client before shipping. No live authenticated request or token refresh was made during planning.

Keep only a short-lived in-memory snapshot tied to the active account context. Refresh on initial capability use, explicit refresh, and resume/account change. Expired or unconfirmed snapshots grant no non-default tier. Coalesce concurrent reads inside this module. Do not add a persisted entitlement database or polling loop.

Alternative: use the static Pi catalog or the CLI's models cache. Rejected because either can describe another account or overstate subscription access.

### 3. Delegate native streaming and enforce the guard outside extension event error handling

Register a decorator of Pi's native `openai-codex` provider under the same route. Delegate native authentication, models, streaming, cancellation, and accounting. Wrap its `stream` and `streamSimple` payload callback: preserve and await the caller's instrumentation, validate the turn's selected tier, then add the verified wire value to the final payload. A failed guard terminates request setup with a safe error before HTTP or WebSocket dispatch. Do not implement or copy the transport.

This callback is owned by the stream wrapper, not solely by the `before_provider_request` event whose exceptions Pi swallows. Test that rejected selections produce zero network requests. Default must preserve standard behavior, not force a non-default field. Never decorate other providers.

Snapshot the selection at turn start so a mid-turn UI change affects only the next turn. Continuations and related requests retain the active turn's snapshot. Revalidate a non-default preference before the next turn, including after resume. A failed confirmation requires a supported selection or manual refresh; do not silently downgrade.

The standalone entry and generated BB extension must not install two decorators. Give the BB adapter explicit managed ownership. The globally installed standalone entry must skip BB-launched sessions; the `pi-subagents` generated extension explicitly installs its adapter. Verify the bundled Pi bridge remains unaffected even when the standalone package is globally installed. Preserve existing custom provider compatibility; report unsupported overrides rather than replacing their transport silently.

### 4. Native-selector integration

The native selector is restored with the accepted BBP-201 limitation described above.
Enable `supportsServiceTier` in this plugin's declaration and register Default and Fast as the accepted vocabulary. Every model entry explicitly narrows that vocabulary: `openai-codex` models use confirmed tiers, and other routes or failed discovery expose no non-default tier. Do not omit the narrowing field and fall back to provider-wide options. Verify the supported BB version's empty/default-only behavior in the real selector.

Extend the generated extension's existing private channel with bounded capability and selection operations. The catalog child reads normalized capabilities from the same Pi runtime that owns its authentication. Keep current model IDs, scoped-model filtering, and selected-only entries intact.

Carry BB `sessionOptions.serviceTier` through session construction and per-turn updates. Set and validate model plus speed before sending a prompt, steer, or follow-up. A non-default tier unavailable to the current account/model fails before dispatch. This uses the existing private channel, not a `/speed` prompt that could create a chat turn.

BB owns the saved thread selection. Pi session entries own standalone persistence. Resume validates either preference before use. Account changes invalidate the safe catalog snapshot; they must not reuse old account options from a workspace catalog cache.

### 5. Established visual controls

BB uses its native speed selector beside the model and reasoning controls. Pi adds `/speed`, `/speed default`, `/speed fast`, `/speed ultrafast`, and `/speed refresh`; the no-argument form offers only current confirmed choices. Explicit unsupported arguments fail clearly. Pi shows the selected speed in a compact status indicator and uses the current theme and keyboard conventions.

Reuse provider-supplied safe usage descriptions when present. Do not invent cost multipliers. Keep controls stable during discovery; omit unavailable menu options instead of disabled placeholders. A saved unavailable preference gets an explanatory error, not a fabricated available picker entry.

The direction reuses established controls and the confirmed visibility rule. No replacement visual composition or prototype is proposed. Live UI acceptance is still required before implementation is complete. Subagent panels, composer navigation, drafts, and lifecycle presentation remain untouched.

## Risks / Trade-offs

- Account model-list fields or client-version requirements can change. Use a versioned adapter with sanitized fixtures and fail closed for non-default tiers. Do not claim Ultrafast works based on synthetic fixtures alone.
- The provider declaration is broader than any one account. Explicit model narrowing and native-selector acceptance must prove unavailable options are hidden, including cold-cache and failed-discovery states.
- Pi payload-event failures can be swallowed. The native stream decorator owns the final guard; tests must prove no transport call occurs on rejection.
- Catalog and session children are separate Pi processes. Each resolves its active account and validates dispatch locally. Never trust the catalog as the only dispatch check.
- Shared code can resolve a second Pi SDK instance or a sibling-only dependency. Keep Pi host packages as peers, preserve the loader's module mapping, and verify the built plugin without access to the pi-plugins checkout.
- Global extension loading can affect unrelated BB providers. Explicit adapter ownership and a bundled-provider regression test prevent that scope leak.
- BBP-201 remains unfixed in BB 0.46. The user accepts fallback Default replacing Fast after failed/revoked discovery and an execution edit. Document this exception and ask the user to check the selection; do not describe the host defect as fixed.

## Native-selector migration plan

1. In pi-plugins, implement and verify the independently installable package without changing token-audit behavior. Produce a pinned distributable artifact and record its version.
2. In bb-plugins, consume that artifact, update only this provider, and verify inherited behavior plus service-tier selection and dispatch.
3. After separate installation approval, try the extension in standalone Pi and the installed `pi-subagents` provider. Confirm the user's Fast-only account never shows Ultrafast. Use fixtures for additional entitlement states; report any live Ultrafast check as not run if no entitled account is available.
4. Document installation and manual refresh. Do not disable the bundled Pi provider or alter defaults.
5. Roll back by selecting Default and restoring the previous plugin/package versions. Retain session history. Removal or configuration edits require separate approval and must not delete credentials or other packages.
