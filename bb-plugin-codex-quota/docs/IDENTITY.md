# Verified thread identity

BBP-19 adds identity attribution only. All checks use isolated synthetic metadata and temporary real databases. There is no installed or billed acceptance. The OpenForge source checkout and its storage are not used. No source was ported and no new licence notice is required.

## Internal modules

- `src/history/identity/identity-discovery.ts` pages public BB metadata. It stores scalar environments, threads, every retained identity change and progress in the plugin's server database. Only `threads.events.list` with `types: ["thread/identity"]` is permitted. No transcript root or filename is discovered.
- `src/history/identity/identity-catalog.ts` computes canonical per-host fingerprints in indexed 50-row steps. A 60-second catalog refresh never waits for another host's delivery. An unchanged host catalog keeps its durable batch cursor. Changed evidence starts a new host delivery; partial refresh heartbeats do not erase the earlier cursor.
- `src/history/identity/identity-server.ts` sends bounded validated evidence to the selected host. It checks cancellation immediately before dispatch. Failed discovery cannot expose new exact totals. Delivery is acknowledged only after an available host response contains attribution.
- `src/history/identity/identity-storage.ts` stores evidence, confirmed relationships, original scalar usage identity, resolution progress and transactional grade/thread totals in the host-owned history database. Immutable source payloads and `usage_entry_owners` are not edited. Indexed pending work is capped at 200 rows per read. Resolution revisions change only for newly verified candidate edges, confirmed relationships or aliases, not catalog generations or display metadata. Unchanged reads do not scan detailed events.
- `src/history/identity/identity-resolution.ts` resolves unique candidates. It never treats a provider identity as a Pi session ID. A captured claim alone or a shared workspace cannot create a candidate.
- `src/history/identity/identity-view.tsx` shows grades and verified totals. The app calls public `useBbNavigate().toThread`. No manually constructed route is used. Long values wrap at 375px.

## Schema-4 storage integration

`initializeHistory` owns the unified schema-4 migration for retention, writer observation, identity and import. It publishes `user_version=4` last in the transaction. See [STORAGE-INTEGRATION.md](STORAGE-INTEGRATION.md) for supported layouts, migration and recovery. Schema 1 with additive identity tables was the historical BBP-19 stage, not the current schema.

`identity_usage.event_id` is a stable usage key, not a replay winner decision. Its `occurred_at`, `session_id`, `workspace`, provider file key, claim and captured total are immutable identity inputs. `thread_id` and `grade` are separate derived binding fields. The database belongs to one recorded host. `identity_receipt.host_id` rejects evidence for another host.

Keep these interfaces when maintaining the integrated storage:

1. Publish each retained compact usage identity to `identity_usage`, including its original UTC instant, recorded workspace, Pi session ID, optional provider key and untrusted claim. Keep original token classes in retained detail and captured cost or missing-price state in the compact record. Do not reconstruct expired classes or prices from current metadata.
2. Insert/update triggers mirror scalar identity and acceptance changes from `usage_events` and `usage_compact` in the ingestion transaction. Identity backfill reads retained compact rows and waits for compact ownership backfill to finish. Detail expiry must not delete a durable binding or replay owner. Compact expiry removes numeric identity rows and their grade/thread totals in the same transaction, while relationship and entry evidence remain.
3. Keep `usage_entry_owners` as the sole first-confirmed replay owner. Identity attribution consumes its accepted/excluded result. It cannot choose a new owner or resurrect an excluded event.
4. Retained compact records carry optional verified thread identity by stable usage key. The evidence/revision/grade tables remain separate, so later conflicting evidence can remove exact attribution without changing recorded usage values.
5. Server/host evidence delivery is incremental and idempotent. If recovery loses the host identity receipt, reset only that host/generation's server delivery cursor and resend the unchanged catalog from offset zero. There is no public per-table API.

## BBP-22 import interface

`recordConfirmedRelationship(db, {sessionId, providerIdentity, workspace})` is internal only. Call it only after an explicitly approved import has confined and verified a file/header on its owning host. `verifyWorkspaceAlias` accepts an owning-host `realpath` function. A successful full-path alias proof permits an import relationship to match a recorded path but never rewrites that path. Failures, unknown aliases, prefixes and basenames are not evidence. BBP-22 calls this through explicit configured-source import. No real installed import was part of BBP-19 or BBP-22 development checks.

## Removed environments and unknown ownership

Discovery first uses the environment list. For missing ownership, it uses public
`environments.get` metadata. Destroyed environments can still prove their owning
host. One lookup per environment per generation runs as a durable step. Each
history read keeps the four-step limit, including lookups. Cancellation does not
record a lookup failure.

`discovery_ownership` records pending, resolved, no-environment, no-host, or
lookup-failed status. Unresolved threads do not stop later pages. Their retained
`thread/identity` events become host-neutral uncertainty rows with
`ownershipUnknown: true` and no title. These rows go to each host catalog to
prevent a conflicting identity from appearing unique. They never create a
host-local edge, thread label, or exact binding. Only matching usage identities
remain non-exact. Unrelated verified identities can reach exact totals.

A completed batch means the metadata scan finished, not that every thread's
ownership is known. The host stores uncertain provider identities separately.
Changes to that set trigger bounded re-resolution, including removal of a prior
exact match. Uncertainty survives missing metadata. Only positive ownership
evidence for that thread can clear it. A later generation can send a host-neutral
resolution marker with `ownershipUnknown: false`. This marker cannot create a
binding. The server carries retained uncertainty and resolution markers into
later catalogs in 50-row steps, including for hosts that missed earlier delivery.
Catalog fingerprints include uncertainty, so unchanged reads retain their receipt. Unexpected
metadata or storage errors reach the caller and produce a fixed warning without
raw SDK payloads.

## Validation

Run focused `identity-*.test.ts*` tests, full `npm test`, typecheck, SDK `--check`, then the complete bundle suite. `scripts/check-bundled-identity.mjs` copies the host artifact outside its dependency tree, forbids network and exercises real temporary persistent SQLite. Run it on both the current Node runtime and Node 22. Run strict OpenSpec and the final build after bundle checks.

For a synthetic preview, build `scripts/identity-preview.tsx` with Bun for the browser only. Serve the fixture and copied `dist/app.css` on `127.0.0.1:38719`. Run `uv run --with playwright python scripts/check-identity-preview.py`. It uses an isolated Chromium session, blocks non-local traffic and proves only synthetic layout/navigation callbacks, not installed BB navigation.
