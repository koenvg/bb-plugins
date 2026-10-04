import { constants } from "node:fs";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { packagedCollectorAsset, COLLECTOR_NAME, validHostDataDir } from "./collector-compatibility.js";
import type { CollectorAction } from "./history-contract.js";
import type { HistoryDatabase } from "./history-storage.js";
import { recordPause } from "./history-projection.js";

export async function safeDirectory(path: string) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error("Collector path unavailable");
}
export async function readControl(directory: string): Promise<boolean | null> {
  let file;
  try { file = await open(join(directory, "collector-control-v1.json"), constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (e) { if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") return null; throw Error("Collector control unavailable"); }
  try {
    const stat = await file.stat(); if (!stat.isFile() || stat.size > 1024) throw Error("Collector control unavailable");
    const bytes = Buffer.alloc(1025), {bytesRead} = await file.read(bytes,0,bytes.length,0);
    const value = JSON.parse(bytes.subarray(0,bytesRead).toString("utf8"));
    if (bytesRead > 1024 || Object.keys(value).length !== 2 || value.protocol !== 1 || typeof value.enabled !== "boolean") throw Error("Collector control unavailable");
    return value.enabled;
  } finally { await file.close(); }
}
export async function atomicWrite(path: string, value: string, signal: AbortSignal) {
  signal.throwIfAborted();
  try { const stat = await lstat(path); if (!stat.isFile() || stat.isSymbolicLink()) throw Error("Collector path unavailable"); }
  catch (e) { if (!(e && typeof e === "object" && "code" in e && e.code === "ENOENT")) throw e; }
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    try { await file.writeFile(value); await file.sync(); } finally { await file.close(); }
    signal.throwIfAborted(); await rename(temporary, path);
  } finally { await unlink(temporary).catch(() => {}); }
}
export async function controlCollector(action: CollectorAction, db: HistoryDatabase, dataDir: string, agentDir: string, now: string, signal: AbortSignal, initialSetup: boolean) {
  if (!validHostDataDir(agentDir)) throw Error("Collector path unavailable");
  const directory = join(dataDir, "history");
  const current = await readControl(directory);
  signal.throwIfAborted();
  if ((!initialSetup || action !== "install") && current === null) throw Error("Collector control unavailable");
  if (action === "install" || action === "repair") {
    await safeDirectory(agentDir); signal.throwIfAborted();
    await safeDirectory(join(agentDir, "extensions")); signal.throwIfAborted();
    const extension = join(agentDir, "extensions", COLLECTOR_NAME);
    await safeDirectory(extension);
    await atomicWrite(join(extension, "index.js"), packagedCollectorAsset(dataDir), signal);
  }
  const enabled = action === "pause" ? false : action === "resume" ? true : current ?? true;
  // Record the pause before publishing control. Interrupted transitions are conservative coverage gaps.
  if (!enabled && current !== false) recordPause(db, now);
  await atomicWrite(join(directory, "collector-control-v1.json"), JSON.stringify({ protocol: 1, enabled }), signal);
  if (enabled && current === false) db.prepare("UPDATE collector_pauses SET ended=? WHERE ended IS NULL").run(now);
}
