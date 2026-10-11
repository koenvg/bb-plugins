# Tasks

See [the capability spec](specs/openai-codex-speed/spec.md) for acceptance and [design.md](design.md) for the approach. Each delivery includes its tests and documentation. Before acceptance, check completion evidence and the owning project's validation and review requirements.

Delivery status and remaining gates are recorded in [verification.md](verification.md). Groups 1–2 use the reviewed pi-plugins delivery. Task 3.3 remains partial pending current-host selector/layout acceptance. The approved BB 0.46 / SDK 0.6.37 migration clears the SDK and build gates. Task 4.3 remains incomplete because the upstream check is inconclusive. Group 5 remains unapproved.

Project ownership is mandatory:

- Groups 1 and 2: **pi-plugins**, `proj_76wa88nbfm`, `/Users/koen/workspace/pi-plugins`.
- Groups 3 and 4: **bb-plugins**, `proj_gjz4e6jtmg`, `bb-plugin-pi-subagents-provider` in this repository.
- Group 5: joint acceptance, with results recorded by the relevant owner.
- **BB**, `proj_6a7gh27yiy`, has no implementation work. Do not change or disable its bundled Pi provider.

This proposal records cross-repository work but does not authorize a repo-local apply to edit pi-plugins. Execute that work in its correct BB project after implementation is authorized. Do not create or dispatch BB Tasks as a side effect of this checklist.

## 1. Account-aware speed package in pi-plugins

- [x] 1.1 Add an independently installable package at `packages/openai-codex-speed` with the shared controller and Pi entry, preserving token-audit. Declare Pi host modules as peers. Check the package manifest, its typecheck, and existing pi-plugins tests.
- [x] 1.2 Implement active-Pi-account Codex model capability discovery and normalized tier mapping at the shared interface. Include sanitized fixtures for Fast-only, both-tier, default-only, failed discovery, unknown mapping, and account change. Verify the model-list request contract and supported wire values against the supported Codex client; keep unverified tiers unavailable. Boundary tests must show another account's CLI cache cannot authorize tiers.
- [x] 1.3 Add bounded in-memory account-aware snapshot reuse and explicit refresh, with no entitlement persistence or polling. Verify concurrent reads, expired data, missing auth, and manual retry; test that default operation remains usable and no credentials or raw authenticated data escape. Document the availability source, privacy rules, and safe errors.

## 2. Standalone Pi selection, dispatch, and resume in pi-plugins

- [x] 2.1 Add `/speed` picker, explicit Default/Fast/Ultrafast arguments, `/speed refresh`, and a compact selected-speed status. Command integration tests must prove unavailable options are absent, unsupported arguments fail, reasoning/model/draft stay unchanged, and selecting speed starts no model request. Document command usage and advertised usage-cost descriptions.
- [x] 2.2 Decorate only native `openai-codex` streaming and delegate its existing transport. Validate the snapshot and set the final wire tier outside swallowed extension-event errors. Capture request payloads to prove Fast mapping, standard Default behavior, continuation stability, mid-turn changes applying next turn, preserved instrumentation/streaming/cancellation, and zero network dispatch for rejected selections. Test server tier rejection with no automatic downgrade.
- [x] 2.3 Persist the standalone session preference and restore it with fresh account/model validation. Resume and provider-switch tests must cover supported Fast, unavailable saved tiers, discovery failure, and account changes, with no non-default leakage to other routes. Document explicit selection or refresh after an unavailable saved tier.
- [x] 2.4 Add explicit standalone versus BB-managed registration ownership, so a global install cannot change the bundled BB Pi provider or double-decorate the plugin session. Verify the relevant runtime-mode fixtures and that separate child sessions keep their own settings. Deliver a versioned package artifact and a documented BB-consumption interface; no sibling checkout may be needed at runtime.

## 3. Native BB speed choices in bb-plugins

- [x] 3.1 Consume the versioned shared artifact and make its implementation available inside the generated Pi extension without copying the Codex transport. Verify build packaging and the generated extension from a clean artifact with no pi-plugins sibling checkout; document the pinned version and supported Pi/BB versions.
- [x] 3.2 Enable service-tier vocabulary only in `src/declaration.ts` for `pi-subagents`. Extend `src/bridge/catalog.ts`, its private-channel exchange, and `src/model-list.ts` to publish explicitly narrowed tiers for every model. Catalog/model-list tests must cover Fast-only, both-tier, no-tier, failed/cold discovery, non-Codex routes, account changes, scoped models, and selected-only entries; none may fall back to all provider-wide choices.
- [ ] 3.3 Verify the native BB selector with these model entries, including empty/default-only narrowing and loading states. UI/contract checks must show hidden Ultrafast for a Fast-only account, no disabled unavailable choices, stable controls, separate reasoning selection, and no new panel or DOM workaround. Update the plugin README with speed selection and manual capability refresh.

## 4. Guarded BB turn dispatch and resume in bb-plugins

- [x] 4.1 Carry `sessionOptions.serviceTier` through `src/session-params.ts` and `src/bridge/rpc-session.ts`; select and validate model plus speed through the generated extension's private channel before dispatching prompt, steer, or follow-up. Extend existing turn-options and bridge tests to prove the effective tier is applied without synthetic chat turns and that unavailable input causes zero request dispatch.
- [x] 4.2 Preserve BB's saved thread selection on resume and revalidate in the running Pi child, not solely the separate catalog child. Integration tests must prove supported resume, revoked or unconfirmed selection requiring an explicit choice/refresh, account isolation, Default behavior, and no tier injection on other routes. Document these states and the unchanged subagent settings behavior.
- [ ] 4.3 Run the inherited provider test suite, typecheck, build, and applicable upstream-compatibility checks. Add regression evidence for native tools, reasoning/model selection, extension UI, checkpoint forks, manual compaction, and subagent lifecycle/observation. Update compatibility notes with intentional fork-only changes and confirm no BB core, bundled-provider, default-provider, or credential edits.

## 5. Cross-project installed acceptance

- [ ] 5.1 After explicit installation/live-test approval, verify standalone Pi and the installed `pi-subagents` provider using the user's account. Confirm Fast can be selected and sent, resume works, and Ultrafast is absent in both. Verify the bundled provider stays unchanged even with the standalone package installed; record scope diffs and package versions under the correct project owners. Get approval of the working controls before marking UI acceptance complete.
- [ ] 5.2 Run fixture-based both-tier and failure-path acceptance across the shared package and BB bridge, and check packaged operation without local sibling paths. Record live Ultrafast verification as not run unless an entitled account is available; do not claim synthetic coverage proves live entitlement. Document rollback to Default/prior versions without deleting history, credentials, or other packages.
