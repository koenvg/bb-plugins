# Legacy usage proof fixture

`legacy-usage.ts` freezes the serialized payload, UUID digest, and entry evidence from the historical retention test's `event(1)`.
This is a reconstruction from committed source, not a captured user database.

## Provenance

Both historical writers produced the same bytes and proofs:

- Schema 2, commit [`aed64b3fa54c9c095e0613f9a8604605b6884783`](https://github.com/koenvg/bb-plugins/tree/aed64b3fa54c9c095e0613f9a8604605b6884783/bb-plugin-codex-quota).
- Schema 3, commit [`26f915889c7fa70e757947266fa1f4b3e730b906`](https://github.com/koenvg/bb-plugins/tree/26f915889c7fa70e757947266fa1f4b3e730b906/bb-plugin-codex-quota).

For each commit, the relevant files are at the package root:

- `history-retention.test.ts` defines `event(1)`, including its timestamp, session, provider key, thread claim, tokens, and cost.
- `usage-record.ts` defines the property order and `parseCompact` normalization.
- `history-retention.ts` declares `HISTORY_VERSION`, normalizes the record in `insertCompact`, and hashes the complete JSON payload for the UUID digest.
- `usageEvidence` in that same file removes `eventId`, `claimedThreadId`, and `providerSessionKey`, then hashes the remaining JSON in its original order.
- `history-projection.ts` assigns that evidence to the first confirmed entry owner.
- `package-lock.json` pins Zod 4.6.5, also used for the reconstruction.

The fixture was verified by extracting each commit with `git archive`, bundling its historical projection and parser with esbuild, and projecting its unmodified `event(1)` plus confirmation into real SQLite.
Both resulting compact digests and entry-owner proofs matched the constants in `legacy-usage.ts`.
No current quota parser or proof function produced those constants.

To check the frozen bytes independently from the current parser, run this from the repository root:

```sh
node --input-type=module <<'NODE'
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { legacyUsage } from "./bb-plugin-codex-quota/src/history/storage/fixtures/legacy-usage.ts";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const { eventId, claimedThreadId, providerSessionKey, ...values } = JSON.parse(legacyUsage.payload);
assert.equal(hash(legacyUsage.payload), legacyUsage.uuidProof);
assert.equal(hash(JSON.stringify(values)), legacyUsage.evidence);
NODE
```

## Serialization-order negative control

The integration test runs both generated and frozen proofs for schemas 2 and 3.
Keep the generated cases as current-serializer replay coverage.
The frozen cases must never derive their expected proofs from `usageRecordSchema`.

To repeat the negative control, temporarily move the `providerSessionKey` property definition in `collection/usage-record.ts` after `capturedCost` without changing its validation.
Run:

```sh
bun run --cwd bb-plugin-codex-quota test src/history/storage/storage-integration.test.ts -t 'opaque entry and UUID proofs'
```

The two generated cases pass, but both frozen cases fail at the accepted-replay assertion.
This demonstrates the compatibility loss hidden by the shared serializer oracle.
Restore the schema order and rerun the complete storage integration test. All cases must pass.
The mutation is a verification experiment, not a production change.
