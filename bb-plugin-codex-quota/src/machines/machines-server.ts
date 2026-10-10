import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { visibleView, FRESH_MS, MAX_AGE_MS } from "../account/freshness.js";
import { abortable } from "../activity/activity-cancellation.js";
import { emptyActivity } from "../activity/activity-contract.js";
import {
  calendarReportSchema,
  calendarUnavailable,
  type CalendarQuery,
} from "../history/calendar/calendar-contract.js";
import {
  preparationSchema,
  preparationUnavailable,
} from "../history/report-preparation-contract.js";
import { accountObservationSchema } from "../quota/contract.js";
import { createReportCache, type SummaryStorage } from "./report-cache.js";
import {
  MAX_MACHINES,
  type Machine,
  type MachineAccounts,
  type MachineReports,
} from "./machines-contract.js";

const noQuota = (reason: "host-offline" | "unsupported" | "identity-changed") => ({
  state: "unavailable" as const,
  reason,
  snapshot: null,
});
const proofSchema = z.string().regex(/^[a-f0-9]{64}$/);
const aliasPrefix = "machine-account-v1/";
type Dependencies = {
  list(): Promise<Machine[]>;
  get(id: string): Promise<Machine | null>;
  storage: SummaryStorage;
  observe(
    id: string,
    input: { challenge: string; refresh: boolean; includeActivity: boolean },
    signal: AbortSignal,
  ): Promise<unknown>;
  report(id: string, query: CalendarQuery, signal: AbortSignal): Promise<unknown>;
  prepare(id: string, signal: AbortSignal, refresh: boolean): Promise<unknown>;
  now?: () => number;
};

/** Owns enrollment, account correlation and persistent last-known summaries, never source history. */
export function createMachineCoordinator(deps: Dependencies) {
  const lifetime = new AbortController();
  const cache = createReportCache(deps.storage, deps.now);
  const aliases = new Map<string, string>();
  const labels = new Map<string, string>();
  const revisions = new Map<string, number>();
  const verified = (id: string, deadline?: AbortSignal) => {
    const signal = AbortSignal.any([
      lifetime.signal,
      AbortSignal.timeout(3000),
      ...(deadline ? [deadline] : []),
    ]);
    if (signal.aborted) return Promise.resolve(null);
    return abortable(
      deps.get(id).catch(() => null),
      signal,
      null,
    );
  };
  let salt: Promise<string> | undefined;
  let persistentIdentity = true;
  const challenge = () =>
    (salt ??= (async () => {
      const fresh = randomBytes(32).toString("hex");
      try {
        const stored = proofSchema.safeParse(
          await deps.storage.get<unknown>(aliasPrefix + "challenge"),
        );
        if (stored.success) return stored.data;
        await deps.storage.set(aliasPrefix + "challenge", fresh);
      } catch {
        persistentIdentity = false;
      }
      return fresh;
    })());
  const label = (proof: string) => {
    if (!labels.has(proof)) labels.set(proof, `account-${randomUUID()}`);
    return labels.get(proof)!;
  };
  const catalog = async () => {
    lifetime.signal.throwIfAborted();
    const all = await abortable(
      deps.list(),
      AbortSignal.any([lifetime.signal, AbortSignal.timeout(8000)]),
      null,
    );
    if (!all) throw new Error("Machine catalog unavailable");
    lifetime.signal.throwIfAborted();
    const machines = all.slice(0, MAX_MACHINES);
    // Removed enrollment must not survive in the summary cache or account associations.
    if (all.length <= MAX_MACHINES) {
      const ids = new Set(machines.map((machine) => machine.id));
      await cache.pruneMachines(ids).catch(() => undefined);
      for (const id of aliases.keys()) if (!ids.has(id)) aliases.delete(id);
      try {
        for (const key of await deps.storage.list(aliasPrefix)) {
          if (key !== aliasPrefix + "challenge" && !ids.has(key.slice(aliasPrefix.length)))
            await deps.storage.delete(key);
        }
      } catch {
        /* Reads remain usable; report persistence is checked separately. */
      }
    }
    return { machines, truncated: all.length > MAX_MACHINES };
  };
  async function onMachine<T>(
    machine: Machine,
    schema: z.ZodType<T>,
    work: (signal: AbortSignal) => Promise<unknown>,
    deadline?: AbortSignal,
  ): Promise<T | null> {
    if (machine.status !== "connected" || lifetime.signal.aborted || deadline?.aborted) return null;
    const signal = AbortSignal.any([
      lifetime.signal,
      AbortSignal.timeout(12_000),
      ...(deadline ? [deadline] : []),
    ]);
    return abortable(
      (async () => {
        try {
          const before = await deps.get(machine.id);
          if (signal.aborted || before?.status !== "connected") return null;
          const raw = await work(signal);
          const after = await deps.get(machine.id);
          if (signal.aborted || after?.status !== "connected") return null;
          const parsed = schema.safeParse(raw);
          return parsed.success ? parsed.data : null;
        } catch {
          return null;
        }
      })(),
      signal,
      null,
    );
  }
  async function batch<T>(
    machines: Machine[],
    work: (machine: Machine) => Promise<T>,
  ): Promise<T[]> {
    const results: T[] = Array.from({ length: machines.length });
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, machines.length) }, async () => {
        while (next < machines.length && !lifetime.signal.aborted) {
          const index = next++;
          results[index] = await work(machines[index]!);
        }
      }),
    );
    lifetime.signal.throwIfAborted();
    return results;
  }
  const invalidate = async (hostId: string) => {
    revisions.set(hostId, (revisions.get(hostId) ?? 0) + 1);
    await cache.remove(hostId);
  };
  return {
    dispose: () => lifetime.abort(),
    invalidate,
    async mutate<T>(hostId: string, work: () => Promise<T>): Promise<T> {
      await invalidate(hostId);
      try {
        return await work();
      } finally {
        await invalidate(hostId);
      }
    },
    async preparation(refresh: boolean) {
      const { machines } = await catalog();
      const deadline = AbortSignal.timeout(25_000);
      const rows = await batch(
        machines,
        async (machine) =>
          (await onMachine(
            machine,
            preparationSchema,
            (signal) => deps.prepare(machine.id, signal, refresh),
            deadline,
          )) ?? preparationUnavailable("host-offline"),
      );
      if (!rows.some((row) => row.state !== "unavailable"))
        return preparationUnavailable("not-configured");
      const progress = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
      return {
        state: rows.some((row) => row.state === "pending")
          ? ("pending" as const)
          : ("settled" as const),
        progress,
      };
    },
    async accounts(input: {
      refresh: boolean;
      includeActivity: boolean;
    }): Promise<MachineAccounts> {
      const { machines, truncated } = await catalog();
      const deadline = AbortSignal.timeout(25_000);
      const nonce = await challenge();
      const rows = await batch(machines, async (machine) => {
        const observation = await onMachine(
          machine,
          accountObservationSchema,
          (signal) => deps.observe(machine.id, { ...input, challenge: nonce }, signal),
          deadline,
        );
        let proof = observation?.proof ?? null;
        if (machine.status !== "connected") {
          proof = aliases.get(machine.id) ?? null;
          if (!proof && persistentIdentity) {
            try {
              proof =
                proofSchema.safeParse(await deps.storage.get<unknown>(aliasPrefix + machine.id))
                  .data ?? null;
            } catch {
              /* Unknown identity is explicit. */
            }
          }
        } else if (proof) {
          aliases.set(machine.id, proof);
          if (persistentIdentity)
            await deps.storage.set(aliasPrefix + machine.id, proof).catch(() => undefined);
        } else {
          aliases.delete(machine.id);
          await deps.storage.delete(aliasPrefix + machine.id).catch(() => undefined);
        }
        const current = await verified(machine.id, deadline);
        return current ? { machine: current, proof, observation } : null;
      });
      const groups = new Map<string, MachineAccounts["accounts"][number]>();
      const now = deps.now?.() ?? Date.now();
      for (const { machine, proof, observation } of rows.filter((row) => row !== null)) {
        const key = proof ? label(proof) : `unknown-${machine.id}`;
        const quota = visibleView(
          observation?.quota ??
            noQuota(machine.status === "connected" ? "unsupported" : "host-offline"),
          now,
        );
        let activity =
          observation?.activity ??
          emptyActivity(machine.status === "connected" ? "unsupported" : "host-offline");
        const age = activity.snapshot ? now - Date.parse(activity.snapshot.observedAt) : 0;
        if (!Number.isFinite(age) || age < 0 || age >= MAX_AGE_MS)
          activity = emptyActivity("expired");
        else if (age >= FRESH_MS && activity.state === "fresh")
          activity = { ...activity, state: "stale", reason: "aged" };
        const old = groups.get(key);
        if (!old)
          groups.set(key, {
            key,
            identity: proof ? "verified" : "unknown",
            machines: [machine.id],
            quota,
            activity,
          });
        else {
          old.machines.push(machine.id);
          // Account-wide feeds are observations, not quantities to sum across machines.
          if (better(quota, old.quota)) old.quota = quota;
          if (better(activity, old.activity)) old.activity = activity;
        }
      }
      lifetime.signal.throwIfAborted();
      return {
        machines: rows.flatMap((row) => (row ? [row.machine] : [])),
        truncated: truncated || rows.some((row) => !row),
        accounts: [...groups.values()],
      };
    },
    async reports(input: {
      query: CalendarQuery;
      prepare: boolean;
      refresh: boolean;
    }): Promise<MachineReports> {
      const { machines, truncated } = await catalog();
      let persistence = true;
      const deadline = AbortSignal.timeout(25_000);
      const rows = await batch(machines, async (machine) => {
        const revision = revisions.get(machine.id) ?? 0;
        const preparation = input.prepare
          ? ((await onMachine(
              machine,
              preparationSchema,
              (signal) => deps.prepare(machine.id, signal, input.refresh),
              deadline,
            )) ?? preparationUnavailable("host-offline"))
          : preparationUnavailable("unsupported");
        let report =
          (await onMachine(
            machine,
            calendarReportSchema,
            (signal) => deps.report(machine.id, input.query, signal),
            deadline,
          )) ??
          calendarUnavailable(machine.status === "connected" ? "unsupported" : "host-offline");
        let cached = false;
        if ((revisions.get(machine.id) ?? 0) !== revision)
          report = calendarUnavailable("selection-changed");
        else if (report.state !== "unavailable") {
          if (JSON.stringify(report.query) !== JSON.stringify(input.query))
            report = calendarUnavailable("unsupported");
          else
            await cache.save(machine.id, report).catch(() => {
              persistence = false;
            });
        } else if (["not-configured", "storage-incompatible"].includes(report.reason)) {
          await cache.remove(machine.id).catch(() => {
            persistence = false;
          });
        } else if (report.reason === "range-unavailable") {
          await cache.removeQuery(machine.id, input.query).catch(() => {
            persistence = false;
          });
        } else {
          try {
            const previous = await cache.read(machine.id, input.query);
            if (previous) {
              report = previous;
              cached = true;
            }
          } catch {
            persistence = false;
          }
        }
        const current = await verified(machine.id, deadline);
        if ((revisions.get(machine.id) ?? 0) !== revision) {
          report = calendarUnavailable("selection-changed");
          cached = false;
        }
        return current ? { machine: current, preparation, report, cached } : null;
      });
      return {
        machines: rows.filter((row) => row !== null),
        truncated: truncated || rows.some((row) => !row),
        cache: persistence ? "saved" : "unavailable",
      };
    },
  };
}
function better(
  next: { state: string; snapshot: { observedAt: string } | null },
  old: { state: string; snapshot: { observedAt: string } | null },
) {
  const rank = (value: typeof next) =>
    value.state === "fresh" ? 2 : value.state === "stale" ? 1 : 0;
  return (
    rank(next) > rank(old) ||
    (rank(next) === rank(old) &&
      Date.parse(next.snapshot?.observedAt ?? "") > Date.parse(old.snapshot?.observedAt ?? ""))
  );
}
