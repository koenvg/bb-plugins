import { opendir, realpath } from "node:fs/promises";
import { basename, join, normalize } from "node:path";
import type { HistoryDatabase } from "../storage/history-storage.js";
import type { ImportConfiguration } from "./import-contract.js";
import { proveRoot, revalidateRoot } from "./import-source.js";
import { diagnostic, type Frozen, type Generation } from "./import-state.js";
export async function freeze(
  configuration: ImportConfiguration,
  known: string[],
  catalog: number,
): Promise<Frozen> {
  const workspaces: Frozen["workspaces"] = [];
  for (const recorded of configuration.workspaces) {
    const proof = await proveRoot(recorded);
    let verified = false;
    for (const path of known) {
      try {
        if ((await realpath(path)) === proof.resolved) {
          verified = true;
          break;
        }
      } catch {}
    }
    if (!verified) throw Error("Import workspace unavailable");
    workspaces.push({
      recorded: normalize(recorded),
      resolved: proof.resolved,
      identity: proof.identity,
    });
  }
  const roots = await Promise.all(
    [configuration.bbRoot, ...configuration.ordinaryRoots].map(proveRoot),
  );
  if (new Set(roots.map((r) => r.resolved)).size !== roots.length)
    throw Error("Import roots overlap");
  return { roots, workspaces, catalog };
}
export async function validateFrozen(frozen: Frozen) {
  for (const root of frozen.roots) await revalidateRoot(root);
  for (const w of frozen.workspaces)
    await revalidateRoot({
      configured: w.recorded,
      resolved: w.resolved,
      identity: w.identity,
    });
}
function addCandidate(
  db: HistoryDatabase,
  g: Generation,
  f: Frozen,
  root: number,
  name: string,
  provider: string | null,
) {
  db.prepare(
    "INSERT OR IGNORE INTO import_candidates VALUES (?,?,?,?,?,'pending',0,0,NULL,NULL,NULL,NULL)",
  ).run(g.id, join(f.roots[root].resolved, name), root, name, provider);
}
export async function discover(db: HistoryDatabase, g: Generation, f: Frozen, signal: AbortSignal) {
  const providers = db
    .prepare(
      `SELECT DISTINCT provider_identity AS provider FROM identity_edges e JOIN identity_generations g USING(generation) WHERE g.complete=1 AND e.generation<=? AND provider_identity>? ORDER BY provider_identity LIMIT 100`,
    )
    .all(f.catalog, g.provider_cursor) as { provider: string }[];
  db.transaction(() => {
    for (const { provider } of providers) {
      signal.throwIfAborted();
      if (
        basename(provider) !== provider ||
        provider === "." ||
        provider === ".." ||
        provider.includes("\\")
      ) {
        diagnostic(db, g, "identity-unresolved");
        continue;
      }
      addCandidate(db, g, f, 0, provider + ".jsonl", provider);
    }
    g.provider_cursor = providers.at(-1)?.provider ?? g.provider_cursor;
    db.prepare("UPDATE import_generations SET provider_cursor=? WHERE id=?").run(
      g.provider_cursor,
      g.id,
    );
  });
  if (providers.length === 100) return;
  if (g.root_cursor < f.roots.length) {
    const root = f.roots[g.root_cursor];
    await revalidateRoot(root);
    const directory = await opendir(root.resolved);
    let seen = 0;
    try {
      while (seen < 256) {
        signal.throwIfAborted();
        const entry = await directory.read();
        if (!entry) break;
        seen++;
        if (entry.name.endsWith(".jsonl")) addCandidate(db, g, f, g.root_cursor, entry.name, null);
      }
      if (seen === 256) diagnostic(db, g, "discovery-limit");
    } finally {
      await directory.close();
    }
    g.root_cursor++;
    db.prepare("UPDATE import_generations SET root_cursor=? WHERE id=?").run(g.root_cursor, g.id);
    return;
  }
  g.phase = "headers";
  db.prepare("UPDATE import_generations SET phase='headers' WHERE id=?").run(g.id);
}
