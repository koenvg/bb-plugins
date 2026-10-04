import { isAbsolute, join } from "node:path";
import { packageName, prerequisites, type SourceInspection } from "./source.ts";

// Normalized read-only inventory, not a new SDK or a write-capable automation API.
export interface SourceRecord {
  projectId: string; hostId: string; path: string; kind: "project-source" | "worktree";
  expiresAt: string | null; durable: boolean;
}
export interface ScheduleRecord {
  id: string; projectId: string; name: string; problem?: string;
  mode?: string; script?: string; interpreter?: string;
  cron?: string; timezone?: string; enabled?: boolean;
  workingDirectory?: { type: string; path?: string };
}
export interface SetupPorts {
  sources(projectId: string): Promise<{ complete: boolean; records: SourceRecord[] }>;
  inspect(path: string): Promise<SourceInspection>;
  schedules(projectId: string): Promise<{ complete: boolean; records: ScheduleRecord[] }>;
}
interface Plan {
  projectId: string; source: string; sourceRevision: string; name: string;
  cron: "0 9 * * 1"; timezone: "UTC"; script: string; interpreter: "bash";
  workingDirectory: "automation-storage";
}
export type SetupPlan = (Plan & { action: "create-after-approval" }) |
  (Plan & { action: "reuse"; id: string; enabled: boolean }) | { action: "blocked"; reason: string };
const marker = "bb-pi-upstream-monitor:v1";
const idPattern = /^[a-z]+_[A-Za-z0-9_-]{1,100}$/;
const quote = (text: string) => `'${text.replaceAll("'", `'"'"'`)}'`;

/** Return a plan only. This module cannot create, change, enable, pause, or run a schedule. */
export async function planWeeklyCheck(input: { projectId: string; serverHostId: string }, ports: SetupPorts): Promise<SetupPlan> {
  try {
    if (!idPattern.test(input.projectId) || !input.projectId.startsWith("proj_") || !idPattern.test(input.serverHostId) || !input.serverHostId.startsWith("host_")) throw new Error();
    const inventory = await ports.sources(input.projectId);
    if (!inventory.complete) return { action: "blocked", reason: "Incomplete server-host source inventory" };
    const sources = inventory.records.filter((r) => r.projectId === input.projectId && r.hostId === input.serverHostId);
    if (sources.length !== 1) return { action: "blocked", reason: "Missing or ambiguous server-host project source" };
    const source = sources[0];
    if (source.kind !== "project-source" || source.expiresAt !== null || source.durable !== true ||
        !isAbsolute(source.path) || /[\x00-\x1f\x7f]/.test(source.path) || /(?:^|\/)(?:worktrees|thr_[^/]+)(?:\/|$)/.test(source.path)) {
      return { action: "blocked", reason: "Source is not an explicitly durable project source" };
    }
    const inspection = await ports.inspect(source.path);
    if (!inspection.ready) return { action: "blocked", reason: inspection.reason };
    if (inspection.root !== source.path || inspection.packageDir !== join(source.path, packageName) || !/^[0-9a-f]{40}$/.test(inspection.sourceRevision)) throw new Error();
    const plan: Plan = {
      projectId: input.projectId, source: inspection.root, sourceRevision: inspection.sourceRevision,
      name: `${marker} ${input.projectId}`, cron: "0 9 * * 1", timezone: "UTC",
      script: weeklyWrapper(input.projectId, inspection.root), interpreter: "bash", workingDirectory: "automation-storage",
    };
    const schedules = await ports.schedules(input.projectId);
    if (!schedules.complete) return { action: "blocked", reason: "Incomplete project schedule inventory" };
    // Any ownership marker or exact reserved name is a candidate, including damaged records.
    const candidates = schedules.records.filter((r) => r.name === plan.name || r.script?.includes(marker));
    if (candidates.length > 1) return { action: "blocked", reason: "Ambiguous upstream-check ownership; no duplicate will be planned" };
    if (!candidates.length) return { ...plan, action: "create-after-approval" };
    const r = candidates[0];
    if (!r.id || r.projectId !== input.projectId || r.problem || r.name !== plan.name || r.mode !== "script" ||
        r.script !== plan.script || r.interpreter !== plan.interpreter || r.cron !== plan.cron || r.timezone !== plan.timezone ||
        r.workingDirectory?.type !== plan.workingDirectory || typeof r.enabled !== "boolean") {
      return { action: "blocked", reason: "Owned record needs explicit review or wrapper refresh; no replacement will be planned" };
    }
    return { ...plan, action: "reuse", id: r.id, enabled: r.enabled };
  } catch { return { action: "blocked", reason: "Source or ownership lookup failed" }; }
}

/** BB copies this body. Its absolute source and ownership cannot depend on a worker cwd. */
function weeklyWrapper(projectId: string, root: string): string {
  if (!idPattern.test(projectId) || !projectId.startsWith("proj_") || !isAbsolute(root) || /[\x00-\x1f\x7f]/.test(root)) throw new Error("Invalid wrapper source");
  const pkg = join(root, packageName);
  return `#!/bin/bash
# ${marker} ${projectId}
set -euo pipefail
for variable in \${!GIT_@}; do unset "$variable"; done
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
export GIT_OPTIONAL_LOCKS=0
fail() { printf '%s\\n' 'Upstream check inconclusive: stable source or checker prerequisites unavailable' >&2; exit 1; }
[ "\${BB_PROJECT_ID:-}" = ${quote(projectId)} ] || fail
SOURCE=${quote(root)}
PACKAGE=${quote(pkg)}
[ -d "$SOURCE/.git" ] && [ ! -L "$SOURCE/.git" ] || fail
cd "$SOURCE" || fail
[ "$(pwd -P)" = "$SOURCE" ] || fail
[ "$(git --no-optional-locks -c core.fsmonitor=false rev-parse --show-toplevel)" = "$SOURCE" ] || fail
[ "$(cd "$PACKAGE/src/upstream" && pwd -P)" = "$PACKAGE/src/upstream" ] || fail
${prerequisites.map((file) => `[ -f ${quote(`${pkg}/${file}`)} ] && [ ! -L ${quote(`${pkg}/${file}`)} ] || fail\ngit --no-optional-locks -c core.fsmonitor=false show ${quote(`HEAD:${packageName}/${file}`)} | cmp - ${quote(`${pkg}/${file}`)} >/dev/null || fail`).join("\n")}
DIRTY=$(git --no-optional-locks -c core.fsmonitor=false status --porcelain=v1 --untracked-files=all -- ${prerequisites.map((file) => quote(`${packageName}/${file}`)).join(" ")}) || fail
[ -z "$DIRTY" ] || fail
exec node "$PACKAGE/src/upstream/cli.ts" --source "$PACKAGE" --project ${quote(projectId)}
`;
}
