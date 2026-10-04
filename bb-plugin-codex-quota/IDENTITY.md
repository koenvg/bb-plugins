# Verified thread identity

BBP-19 adds identity attribution only. All checks use isolated synthetic metadata and temporary real databases. There is no installed or billed acceptance. The OpenForge source checkout and its storage are not used. No source was ported and no new licence notice is required.

## Internal modules

- `identity-discovery.ts` pages public BB metadata. It stores scalar environments, threads, every retained identity change and progress in the plugin's server database. Only `threads.events.list` with `types: ["thread/identity"]` is permitted. No transcript root or filename is discovered.
- `identity-catalog.ts` computes canonical per-host fingerprints in indexed 50-row steps. A 60-second catalog refresh never waits for another host's delivery. An unchanged host catalog keeps its durable batch cursor. Changed evidence starts a new host delivery; partial refresh heartbeats do not erase the earlier cursor.
- `identity-server.ts` sends bounded validated evidence to the selected host. It checks cancellation immediately before dispatch. Failed discovery cannot expose new exact totals. Delivery is acknowledged only after an available host response contains attribution.
- `identity-storage.ts` stores evidence, confirmed relationships, original scalar usage identity, resolution progress and transactional grade/thread totals in the host-owned history database. Immutable source payloads and `usage_entry_owners` are not edited. Indexed pending work is capped at 200 rows per read. Resolution revisions change only for newly verified candidate edges, confirmed relationships or aliases, not catalog generations or display metadata. Unchanged reads do not scan detailed events.
- `identity-resolution.ts` resolves unique candidates. It never treats a provider identity as a Pi session ID. A captured claim alone or a shared workspace cannot create a candidate.
- `identity-view.tsx` shows grades and verified totals. The app calls public `useBbNavigate().toThread`. No manually constructed route is used. Long values wrap at 375px.

## BBP-23 storage integration

The existing history schema stays version 1. New `identity_*` tables and triggers are additive. `identity_usage.event_id` is a stable usage key, not a replay winner decision. Its `occurred_at`, `session_id`, `workspace`, provider file key, claim and captured total are immutable identity inputs. `thread_id` and `grade` are separate derived binding fields. The database belongs to one recorded host. `identity_receipt.host_id` rejects evidence for another host.

Keep these interfaces when integrating the sibling retention projection:

1. Publish each accepted compact usage identity to `identity_usage`, including its original UTC instant, recorded workspace, Pi session ID, optional provider key and untrusted claim. Preserve token classes and captured price in the BBP-23 compact record. Do not reconstruct either from current metadata.
2. The current insert/update triggers mirror `usage_events` into identity rows and mark acceptance changes pending. If BBP-23 makes a compact table authoritative or drops detailed rows, use the same scalar publication and acceptance-change interface in its ingestion transaction. Deleting a detail row must not delete a durable binding or replay owner. Expiring a compact contribution must remove its grade/thread projection in the same transaction. BBP-19 does not implement expiration or pruning.
3. Keep `usage_entry_owners` as the sole first-confirmed replay owner. Identity attribution consumes its accepted/excluded result. It cannot choose a new owner or resurrect an excluded event.
4. Retained compact records can carry optional verified thread identity by stable usage key. The evidence/revision/grade tables remain separate, so later conflicting evidence can remove exact attribution without changing recorded usage values.
5. Server/host evidence delivery is incremental and idempotent. Recovery that replaces a host database must also reset that host's server delivery receipt. BBP-19 does not replace or recover databases. There is no public per-table API.

## BBP-22 import interface

`recordConfirmedRelationship(db, {sessionId, providerIdentity, workspace})` is internal only. Call it only after an explicitly approved import has confined and verified a file/header on its owning host. `verifyWorkspaceAlias` accepts an owning-host `realpath` function. A successful full-path alias proof permits an import relationship to match a recorded path but never rewrites that path. Failures, unknown aliases, prefixes and basenames are not evidence. No real import is part of BBP-19.

## Validation

Run focused `identity-*.test.ts*` tests, full `npm test`, typecheck, SDK `--check`, then the complete bundle suite. `scripts/check-bundled-identity.mjs` copies the host artifact outside its dependency tree, forbids network and exercises real temporary persistent SQLite. Run it on both the current Node runtime and Node 22. Run strict OpenSpec and the final build after bundle checks.

For a synthetic preview, build `scripts/identity-preview.tsx` with Bun for the browser only. Serve the fixture and copied `dist/app.css` on `127.0.0.1:38719`. Run `uv run --with playwright python scripts/check-identity-preview.py`. It uses an isolated Chromium session, blocks non-local traffic and proves only synthetic layout/navigation callbacks, not installed BB navigation.
