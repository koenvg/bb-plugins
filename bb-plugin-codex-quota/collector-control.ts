import { constants } from "node:fs";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  packagedCollectorAsset,
  COLLECTOR_NAME,
  validHostDataDir,
} from "./collector-compatibility.js";
import type { CollectorAction } from "./history-contract.js";
import type { HistoryDatabase } from "./history-storage.js";
import { recordPause } from "./history-projection.js";

export async function safeDirectory(path: string) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error("Collector path unavailable");
}
export type CollectorControl =
  | { protocol: 1; enabled: boolean }
  | { protocol: 2; enabled: boolean; revision: string };
export async function readControlRecord(directory: string): Promise<CollectorControl | null> {
  let file;
  try {
    file = await open(
      join(directory, "collector-control-v1.json"),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") return null;
    throw Error("Collector control unavailable");
  }
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 1024) throw Error("Collector control unavailable");
    const bytes = Buffer.alloc(1025),
      { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    const value = JSON.parse(bytes.subarray(0, bytesRead).toString("utf8"));
    const legacy = value?.protocol === 1 && Object.keys(value).length === 2;
    const fenced =
      value?.protocol === 2 &&
      Object.keys(value).length === 3 &&
      typeof value.revision === "string" &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.revision);
    if (bytesRead > 1024 || typeof value?.enabled !== "boolean" || (!legacy && !fenced))
      throw Error("Collector control unavailable");
    return value as CollectorControl;
  } finally {
    await file.close();
  }
}
export async function readControl(directory: string): Promise<boolean | null> {
  return (await readControlRecord(directory))?.enabled ?? null;
}
/** Canonical read safety for both readiness and asset-independent reports. */
export async function readHistoryControl(
  db: HistoryDatabase,
  directory: string,
): Promise<boolean | null> {
  const enabled = await readControl(directory);
  const established = db.prepare("SELECT first_observed FROM collector_meta WHERE id=1").get();
  if ((enabled === null && established) || (enabled !== null && !established))
    throw Error("Collector control unavailable");
  return enabled;
}
export async function publishControl(directory: string, enabled: boolean, signal: AbortSignal) {
  const control = { protocol: 2 as const, enabled, revision: randomUUID() };
  await atomicWrite(join(directory, "collector-control-v1.json"), JSON.stringify(control), signal);
  return control;
}
export async function atomicWrite(path: string, value: string, signal: AbortSignal) {
  signal.throwIfAborted();
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error("Collector path unavailable");
  } catch (e) {
    if (!(e && typeof e === "object" && "code" in e && e.code === "ENOENT")) throw e;
  }
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600,
    );
    try {
      await file.writeFile(value);
      await file.sync();
    } finally {
      await file.close();
    }
    signal.throwIfAborted();
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
export async function controlCollector(
  action: CollectorAction,
  db: HistoryDatabase,
  dataDir: string,
  agentDir: string,
  now: string,
  signal: AbortSignal,
  initialSetup: boolean,
) {
  if (action === "prepare-legacy" || action === "retire-legacy")
    throw Error("Collector control unavailable");
  if (!validHostDataDir(agentDir)) throw Error("Collector path unavailable");
  const directory = join(dataDir, "history");
  const current = await readControl(directory);
  signal.throwIfAborted();
  if ((!initialSetup || action !== "install") && current === null)
    throw Error("Collector control unavailable");
  if (action === "install" || action === "repair") {
    await safeDirectory(agentDir);
    signal.throwIfAborted();
    await safeDirectory(join(agentDir, "extensions"));
    signal.throwIfAborted();
    const extension = join(agentDir, "extensions", COLLECTOR_NAME);
    await safeDirectory(extension);
    await atomicWrite(join(extension, "index.js"), packagedCollectorAsset(dataDir), signal);
  }
  const enabled = action === "pause" ? false : action === "resume" ? true : (current ?? true);
  // Record the pause before publishing control. Interrupted transitions are conservative coverage gaps.
  if (!enabled && current !== false) recordPause(db, now);
  await publishControl(directory, enabled, signal);
  if (enabled && current === false)
    db.prepare("UPDATE collector_pauses SET ended=? WHERE ended IS NULL").run(now);
}
