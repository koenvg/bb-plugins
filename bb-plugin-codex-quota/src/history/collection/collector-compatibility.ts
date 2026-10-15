import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { HistoryReadiness } from "../history-contract.js";

import { COLLECTOR_ENTRY } from "./collector-entry.js";
export const COLLECTOR_NAME = "bb-codex-usage";
export const COLLECTOR_PROTOCOL = 2;
const MAX_ASSET_BYTES = 64 * 1024;
export function validHostDataDir(path: string): boolean {
  // oxlint-disable-next-line no-control-regex -- Reject control characters in untrusted input.
  return isAbsolute(path) && path.length <= 16_384 && !/[\u0000-\u001f]/.test(path);
}

/** Self-contained Pi asset. It fails closed until explicit compatible control metadata exists. */
export function packagedCollectorAsset(dataDir: string): string {
  if (!validHostDataDir(dataDir)) throw Error("Invalid collector configuration");
  return (
    `// BB Codex usage collector protocol ${COLLECTOR_PROTOCOL}. No checkout or server dependency.\n` +
    `export const configuration = Object.freeze(${JSON.stringify({ protocol: COLLECTOR_PROTOCOL, dataDir })});\n` +
    `export default function bbCodexUsage(pi) { return (${COLLECTOR_ENTRY})(pi, configuration); }\n`
  );
}

export async function inspectCollectorAsset(
  agentDir: string,
  dataDir: string,
  runtimeSupported: boolean,
): Promise<"compatible" | "repairable-existing" | "missing" | "unsafe" | "runtime-unsupported"> {
  if (!runtimeSupported) return "runtime-unsupported";
  if (!validHostDataDir(agentDir) || !validHostDataDir(dataDir)) return "unsafe";
  const directory = join(agentDir, "extensions", COLLECTOR_NAME);
  try {
    const root = await lstat(agentDir);
    if (!root.isDirectory() || root.isSymbolicLink()) return "unsafe";
    const parent = await lstat(join(agentDir, "extensions"));
    if (!parent.isDirectory() || parent.isSymbolicLink()) return "unsafe";
    const folder = await lstat(directory);
    if (!folder.isDirectory() || folder.isSymbolicLink()) return "unsafe";
    const existing = await lstat(join(directory, "index.js"));
    if (!existing.isFile() || existing.isSymbolicLink() || existing.size > MAX_ASSET_BYTES)
      return "unsafe";
    const file = await open(
      join(directory, "index.js"),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > MAX_ASSET_BYTES) return "unsafe";
      const bytes = Buffer.alloc(MAX_ASSET_BYTES + 1);
      const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
      if (bytesRead > MAX_ASSET_BYTES) return "unsafe";
      const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
      return hash(bytes.subarray(0, bytesRead)) === hash(packagedCollectorAsset(dataDir))
        ? "compatible"
        : "repairable-existing";
    } finally {
      await file.close();
    }
  } catch (error) {
    return error && typeof error === "object" && "code" in error && error.code === "ENOENT"
      ? "missing"
      : "unsafe";
  }
}

export async function readCollectorCompatibility(
  agentDir: string,
  dataDir: string,
  runtimeSupported: boolean,
): Promise<HistoryReadiness["collector"]> {
  const asset = await inspectCollectorAsset(agentDir, dataDir, runtimeSupported);
  return asset === "compatible"
    ? "compatible-v1"
    : asset === "missing"
      ? "missing"
      : "incompatible";
}
