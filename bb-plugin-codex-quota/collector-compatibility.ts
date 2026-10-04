import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { HistoryReadiness } from "./history-contract.js";

import { COLLECTOR_ENTRY } from "./collector-entry.js";
export const COLLECTOR_NAME = "bb-codex-usage";
export const COLLECTOR_PROTOCOL = 2;
const MAX_ASSET_BYTES = 64 * 1024;
export function validHostDataDir(path: string): boolean {
  return isAbsolute(path) && path.length <= 16_384 && !/[\u0000-\u001f]/.test(path);
}

/** Self-contained Pi asset. It fails closed until explicit compatible control metadata exists. */
export function packagedCollectorAsset(dataDir: string): string {
  if (!validHostDataDir(dataDir)) throw Error("Invalid collector configuration");
  return `// BB Codex usage collector protocol ${COLLECTOR_PROTOCOL}. No checkout or server dependency.\n` +
    `export const configuration = Object.freeze(${JSON.stringify({ protocol: COLLECTOR_PROTOCOL, dataDir })});\n` +
    `export default function bbCodexUsage(pi) { return (${COLLECTOR_ENTRY})(pi, configuration); }\n`;
}

export async function readCollectorCompatibility(agentDir: string, dataDir: string, runtimeSupported: boolean): Promise<HistoryReadiness["collector"]> {
  if (!runtimeSupported || !validHostDataDir(agentDir) || !validHostDataDir(dataDir)) return "incompatible";
  const directory = join(agentDir, "extensions", COLLECTOR_NAME);
  try {
    const parent = await lstat(join(agentDir, "extensions"));
    if (!parent.isDirectory() || parent.isSymbolicLink()) return "incompatible";
    const folder = await lstat(directory);
    if (!folder.isDirectory() || folder.isSymbolicLink()) return "incompatible";
    const file = await open(join(directory, "index.js"), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > MAX_ASSET_BYTES) return "incompatible";
      const bytes = Buffer.alloc(MAX_ASSET_BYTES + 1);
      const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
      if (bytesRead > MAX_ASSET_BYTES) return "incompatible";
      const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
      return hash(bytes.subarray(0, bytesRead)) === hash(packagedCollectorAsset(dataDir)) ? "compatible-v1" : "incompatible";
    } finally { await file.close(); }
  } catch (error) {
    return error && typeof error === "object" && "code" in error && error.code === "ENOENT" ? "missing" : "incompatible";
  }
}
