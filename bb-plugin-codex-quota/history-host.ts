import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { historyUnavailable, type HistoryReadiness } from "./history-contract.js";
import { loadHistoryStorage, type HistoryDatabaseFactory } from "./history-storage.js";
import { readCollectorCompatibility, validHostDataDir } from "./collector-compatibility.js";

export type HistoryReadContext = { signal: AbortSignal; dataDir: string };
export interface HostHistory { read(context: HistoryReadContext): Promise<HistoryReadiness> }
type Dependencies = {
  storage?: () => Promise<HistoryDatabaseFactory | null>;
  agentDir?: () => string;
  collector?: (dataDir: string) => Promise<HistoryReadiness["collector"]>;
};
const missing = (error: unknown) => !!error && typeof error === "object" && "code" in error && error.code === "ENOENT";

export function createHostHistory(deps: Dependencies = {}): HostHistory {
  return {
    async read({ signal, dataDir }) {
      if (signal.aborted) return historyUnavailable("selection-changed");
      let storage: HistoryReadiness["storage"] = "unavailable";
      let collector: HistoryReadiness["collector"] = "unchecked";
      try {
        const factory = await (deps.storage ?? loadHistoryStorage)();
        if (signal.aborted) return historyUnavailable("selection-changed");
        if (!factory || !validHostDataDir(dataDir)) return { ...historyUnavailable("storage-unavailable"), storage };
        storage = "unconfigured";
        const directory = join(dataDir, "history");
        const path = join(directory, "usage-v1.sqlite");
        try {
          const folder = await lstat(directory);
          const file = await lstat(path);
          if (!folder.isDirectory() || folder.isSymbolicLink() || !file.isFile() || file.isSymbolicLink()) {
            storage = "incompatible";
          } else {
            const db = factory(path, true);
            try {
              const row = db.prepare("PRAGMA user_version").get() as { user_version?: unknown } | undefined;
              storage = row?.user_version === 1 ? "compatible" : "incompatible";
            } finally { db.close(); }
          }
        } catch (error) { if (!missing(error)) storage = "unavailable"; }
        if (signal.aborted) return historyUnavailable("selection-changed");
        // The Pi extension ABI is pinned and tested at build time. Its VERSION export reads
        // package.json at runtime and cannot identify a self-contained host artifact.
        collector = await (deps.collector ? deps.collector(dataDir) : readCollectorCompatibility(
          (deps.agentDir ?? getAgentDir)(), dataDir, Number(process.versions.node.split(".")[0]) >= 22));
        if (signal.aborted) return historyUnavailable("selection-changed");
        const reason = storage === "unavailable" ? "storage-unavailable" : storage === "incompatible" ? "storage-incompatible" :
          collector === "incompatible" ? "collector-incompatible" : storage === "unconfigured" || collector === "missing" ? "not-configured" : "ok";
        return { state: reason === "ok" ? "available" : reason === "not-configured" ? "not-configured" : "unavailable", reason, storage, collector, writer: "unconfirmed" };
      } catch { return { ...historyUnavailable("storage-unavailable"), storage: "unavailable" }; }
    },
  };
}
