import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createHostHistory } from "../src/history/history-host.js";
import { initializeHistory } from "../src/history/storage/history-projection.js";
import { openHistoryDatabase } from "../src/history/storage/history-storage.js";
import type { CalendarQuery } from "../src/history/calendar/calendar-contract.js";

export async function prepareNativeUsageFixture(
  fixtures = fileURLToPath(new URL("../fixtures/", import.meta.url)),
) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "native-browser-history-")));
  const home = join(root, "codex"),
    dataDir = join(root, "data");
  const now = Date.parse("2026-10-01T12:00:00Z");
  const history = createHostHistory({ now: () => now, codexHome: () => home });
  try {
    await mkdir(join(home, "sessions"), { recursive: true });
    await mkdir(join(home, "archived_sessions"));
    await mkdir(join(dataDir, "history"), { recursive: true });
    await writeFile(
      join(home, "sessions", "rollout.jsonl"),
      await readFile(join(fixtures, "native-legacy-usage.jsonl")),
    );
    const db = (await openHistoryDatabase(join(dataDir, "history", "usage-v1.sqlite")))!;
    initializeHistory(db, new Date(now).toISOString());
    db.close();
    await writeFile(
      join(dataDir, "history", "collector-control-v1.json"),
      JSON.stringify({
        protocol: 2,
        enabled: false,
        revision: "00000000-0000-4000-8000-000000000099",
      }),
    );
    await writeFile(
      join(dataDir, "history", "events-v1-2026-10-01.jsonl"),
      await readFile(join(fixtures, "pi-legacy-usage.jsonl")),
    );
    const context = {
      dataDir,
      signal: new AbortController().signal,
      identities: {
        hostId: "host_fixture",
        generation: 1,
        offset: 0,
        total: 2,
        rows: [
          {
            threadId: "thr_native_fixture",
            provider: "codex-native" as const,
            providerIdentity: "native-speed-fixture",
            title: "Native fixture",
            state: "available" as const,
          },
          {
            threadId: "thr_pi_fixture",
            providerIdentity: "pi-speed",
            title: "Pi fixture",
            state: "available" as const,
          },
        ],
      },
    };
    for (let i = 0; i < 30; i++) {
      const result = await history.prepare!(context);
      if (result.state !== "available") throw Error(result.reason);
      if (!result.ingestionPending && !result.attribution.backlog) break;
      if (i === 29) throw Error("Native usage fixture did not settle");
    }
    const query: CalendarQuery = {
      startDate: "2026-09-02",
      timezone: "UTC",
      group: "workspace",
      scope: { kind: "host" },
      includeUncertain: true,
    };
    const reports = [];
    for (const group of ["workspace", "thread"] as const)
      for (const startDate of ["2026-09-02", "2026-08-03"]) {
        const report = await history.report(
          { ...query, group, includeUncertain: group === "workspace", startDate },
          context,
        );
        if (report.state === "unavailable") throw Error(report.reason);
        reports.push(report);
      }
    return reports;
  } finally {
    history.dispose();
    await rm(root, { recursive: true, force: true });
  }
}
