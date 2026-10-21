# Native recorded usage

## Request ownership

Visible-page preparation reads the selected host's trusted `CODEX_HOME`, or `~/.codex`, under `sessions` and `archived_sessions`. It uses the existing host history queue. This work is independent from configured Pi historical imports. Preparation may create a private native-only index without installing a Pi collector, changing its controls, or granting import consent. Report reads do not scan source files or write history.

Supported `token_usage_record` rows require a valid response ID, explicit owning thread ID, original request timestamp, and consistent token counts. The first valid session header supplies the workspace. Copied records owned by another thread and conflicting headers cannot establish ownership. A model is attributed only from matching turn context.

Repeated requests, archive moves, and rescans do not add usage twice. Exact host/provider-qualified response aliases across Pi and native count once. Pi retains ownership and its original captured price in either arrival order. Equal counters, paths, accounts, and root sessions are not duplicate proof. Contradictory native token facts remain quarantined.

Legacy `token_count` snapshots cannot prove unique requests or fork ancestry. They are not added and leave coverage incomplete. Independently identified modern requests still count. This does not recover all native history or certify complete active collection.

## Tokens, models, and money

Reports contain scalar token totals and model-attributed counts. The graph selects eight named models with deterministic ordering. Other models contains overflow. Unknown model contains the remainder without retained model detail. Missing dates stay unavailable. Only certified inactivity permits token zero.

Optional `modelCosts` is an independent captured-money partition. Native prices remain unavailable. Positive captured Pi prices keep their exact values. No current prices or fabricated charges are added. Cached input is part of input, and reasoning is part of output. Nonzero cache-write formats retain supported totals but have unavailable token classes.

## Storage and legacy boundaries

Schema version remains 5 with its exact existing table layout. Source and class metadata, native cursors, and hashed response ownership remain separate from immutable Pi scalar proofs. Historical metadata is not reconciled or rewritten. Legacy NOT NULL columns use inert values for new rows. Supported schema-4 reports remain read-only without migration. The incomplete schema-4 identity layout still requires [the explicit offline upgrade](STORAGE_UPGRADE.md).

Old v1 usage records remain readable. Old v2 envelopes lose only obsolete `metadata.serviceTier` at ingress. Active metadata contains only `responseId`. Old saved native contexts lose `tier` on resume. These legacy fields have no effect on tokens, models, replay proofs, or coverage.

A private cache decoder strips obsolete `speedTokens` from days, model rows, summaries, and comparison-prior summaries, plus `otherSpeedTokens` from model overflow. Both cache validation paths decode before strict validation or pruning. Malformed obsolete buckets are ignored. Malformed token totals, over-attribution, and unexpected fields remain invalid. Cache keys and retention bounds are unchanged. New public contracts reject removed fields rather than accepting a removed feature API.

Guarded writer initialization retains the existing transactional migration. Newer, foreign, invalid, or unsettled-WAL storage is rejected before writable access. Reports remain read-only. Existing retention dates and physical pruning remain. Compact expiry removes numeric usage while minimal replay and alias evidence prevents resurrection. Native evidence does not change Pi observation counters, activation, or inactivity certification. Native gaps prevent a false zero.

## Bounded source reads

A pass is limited to 128 discovery entries, 2 MiB, 256 lines, a 1 MiB line ceiling, and 250 ms. Partial lines are not acknowledged. Malformed or oversized required data stays incomplete. Native backlog does not stop Pi logs from draining. Cancellation rolls back unacknowledged source admission and cursor work. The host queue remains held until cleanup completes.

Source reads reject symlink ancestors and files, non-regular files, path escapes, replacement, and pipe races. Rollout paths are never executed. Raw message content and partial buffers do not enter the index, report, or diagnostics. Native extraction does not read credentials.

## Collector deployment requirement

The Pi collector captures bounded assistant response IDs without a provider-stream observer or response-correlation map. It does not retain response bodies. Metadata remains outside immutable v1 usage proofs.

After a future approved deployment, an existing collector may be incompatible because its asset differs. The operator must explicitly choose **Repair collector** and restart existing Pi sessions to load the changed code. Repair preserves paused state, control, and retained history. Local tests do not prove installed collector upgrades and do not authorize installation, repair, or restart.

## Synthetic verification

- `src/history/native/native-usage.integration.test.ts` covers mixed usage, replay, forks, archive moves, alias arrival order, cancellation, classes, prices, confinement, budgets, schema-4 reads, and expiry. It also checks unchanged historical metadata, literal replay proof hashing, and resumed legacy context stripping.
- `src/history/collection/legacy-record.test.ts` checks v1 and v2 ingress. `src/machines/report-cache.test.ts` checks legacy cache survival at both read paths. `src/history/legacy-report-contract.test.ts` checks strict new contracts and aligned offline sums.
- `scripts/check-bundled-native-usage.mjs` invokes the built host entry. Its unchanged legacy fixtures produce 450 mixed tokens, one synthetic model totaling 450, and captured Pi cost 0.03. Repeated preparation stays 450. Native-only usage remains 370 with or without obsolete tier fields.
- `scripts/prepare-native-usage-fixture.ts` supplies public backend reports to `scripts/browser/native-usage.spec.ts`. At 375px and 1280px it checks values, dates, scopes, metrics, ranking, loading space, retry, and offline display. Fixture controls are not installed BB controls.

The files `native-legacy-usage.jsonl` and `pi-legacy-usage.jsonl` retain historical tier fields and original speed-named identity strings solely as legacy-boundary inputs. The active collector, report, model projection, and UI have no tier dimension.

Package tests, typecheck, build, bundle probes, and owned browser checks are separate evidence. The probes use temporary fixture roots and no live network. They do not establish installed BB navigation, real capture, physical-device behavior, or screen-reader speech.
