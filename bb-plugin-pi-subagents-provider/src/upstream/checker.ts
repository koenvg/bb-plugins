// This module accepts data only. It has no filesystem, Git, scheduler, or agent access.
import { treeCoverage } from "./trees.ts";
export type Transport = (
  path: string,
  signal: AbortSignal,
) => Promise<{
  status: number;
  data: unknown;
  next: boolean;
}>;
export interface Baseline {
  schemaVersion: 1;
  repository: string;
  branch: string;
  revision: string;
  sourcePath: string;
  watchedContractPaths: string[];
}
type ComparisonStage = "baseline" | "branch" | "comparison" | "commit-files" | "tree-coverage";
export type CheckResult =
  | {
      status: "no-relevant-change" | "review-required";
      baseline: string;
      head: string;
      changes: { commit: string; paths: string[] }[];
    }
  | {
      status: "inconclusive";
      reason: string;
      stage?: ComparisonStage;
      baseline?: string;
      head?: string;
    };
export const limits = {
  requests: 256,
  pages: 20,
  commits: 2000,
  filesPerCommit: 3000,
  durationMs: 90_000,
  requestMs: 10_000,
};
const shaPattern = /^[0-9a-f]{40}$/;
// oxlint-disable-next-line eslint/no-control-regex -- Reject control bytes in untrusted upstream identifiers and paths.
const controlPattern = /[\x00-\x1f\x7f]/;
function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid upstream data");
  return value as Record<string, any>;
}
function sha(value: unknown): string {
  if (typeof value !== "string" || !shaPattern.test(value))
    throw new Error("Invalid upstream revision");
  return value;
}
function repoPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 512 ||
    controlPattern.test(value) ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.split("/").some((p) => !p || p === "." || p === "..")
  ) {
    throw new Error("Invalid watched path or upstream filename");
  }
  return value;
}
export function parseBaseline(value: unknown): Baseline {
  const b = object(value);
  if (
    b.schemaVersion !== 1 ||
    typeof b.repository !== "string" ||
    !/^https:\/\/github\.com\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\.git$/.test(b.repository) ||
    typeof b.branch !== "string" ||
    !/^[A-Za-z0-9_./-]{1,200}$/.test(b.branch) ||
    b.branch.split("/").some((p: string) => !p || p === "." || p === "..") ||
    !Array.isArray(b.watchedContractPaths) ||
    !b.watchedContractPaths.length ||
    b.watchedContractPaths.length > 128
  ) {
    throw new Error("Missing or invalid committed baseline");
  }
  return {
    schemaVersion: 1,
    repository: b.repository,
    branch: b.branch,
    revision: sha(b.revision),
    sourcePath: repoPath(b.sourcePath),
    watchedContractPaths: b.watchedContractPaths.map(repoPath),
  };
}

/** Compare all commits, then all files of each commit. Compare's capped file list is never used. */
export async function checkUpstream(
  input: unknown,
  options: {
    transport: Transport;
    now: () => number;
    bounds?: Partial<typeof limits>;
  },
): Promise<CheckResult> {
  let baseline: string | undefined;
  let head: string | undefined;
  let stage: ComparisonStage = "baseline";
  try {
    const b = parseBaseline(input);
    baseline = b.revision;
    const bound = { ...limits, ...options.bounds };
    for (const [key, value] of Object.entries(bound)) {
      if (!Number.isSafeInteger(value) || value < 1 || value > limits[key as keyof typeof limits])
        throw new Error("Invalid comparison bounds");
    }
    const start = options.now();
    let requests = 0;
    const repo = b.repository.slice("https://github.com/".length, -4);
    const prefix = `/repos/${repo}`;
    async function get(path: string) {
      const remaining = bound.durationMs - (options.now() - start);
      if (++requests > bound.requests || remaining <= 0)
        throw new Error("Comparison bound exhausted");
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => {
              controller.abort();
              reject(new Error("Upstream request timed out"));
            },
            Math.min(remaining, bound.requestMs),
          );
        });
        const response = await Promise.race([options.transport(path, controller.signal), timeout]);
        if (options.now() - start >= bound.durationMs)
          throw new Error("Comparison time bound exhausted");
        if (response.status === 403 || response.status === 429)
          throw new Error("Upstream access refused or rate limited");
        if (response.status !== 200) throw new Error("Upstream unavailable");
        if (typeof response.next !== "boolean") throw new Error("Incomplete pagination data");
        return { data: object(response.data), next: response.next };
      } catch (error) {
        // Never include transport errors, URLs, headers, or remote messages in output.
        if (error instanceof Error && safeReasons.has(error.message)) throw error;
        throw new Error("Upstream network failure");
      } finally {
        clearTimeout(timer);
        controller.abort();
      }
    }
    stage = "branch";
    const branch = await get(`${prefix}/branches/${encodeURIComponent(b.branch)}`);
    if (branch.next) throw new Error("Invalid branch pagination");
    head = sha(object(branch.data.commit).sha);
    stage = "comparison";
    const commits: string[] = [];
    let total: number | undefined;
    for (let page = 1; ; page++) {
      if (page > bound.pages) throw new Error("Comparison page bound exhausted");
      const response = await get(
        `${prefix}/compare/${baseline}...${head}?per_page=100&page=${page}`,
      );
      const d = response.data;
      if (
        sha(object(d.base_commit).sha) !== baseline ||
        sha(object(d.merge_base_commit).sha) !== baseline ||
        !["ahead", "identical"].includes(d.status)
      )
        throw new Error("Baseline is not an ancestor of upstream head");
      if (
        !Number.isSafeInteger(d.total_commits) ||
        d.total_commits < 0 ||
        d.total_commits > bound.commits ||
        d.ahead_by !== d.total_commits ||
        (total !== undefined && d.total_commits !== total) ||
        (d.status === "identical") !== (baseline === head) ||
        (d.status === "identical") !== (d.total_commits === 0) ||
        !Array.isArray(d.commits) ||
        d.commits.length > 100
      ) {
        throw new Error("Incomplete comparison commit data");
      }
      total = d.total_commits as number;
      for (const commit of d.commits) {
        const id = sha(object(commit).sha);
        if (id === baseline || commits.includes(id))
          throw new Error("Duplicate or invalid comparison commit");
        commits.push(id);
      }
      if (
        commits.length > total ||
        (response.next && (d.commits.length !== 100 || commits.length >= total))
      )
        throw new Error("Incomplete comparison pagination");
      if (!response.next) {
        if (commits.length !== total || (total > 0 && commits.at(-1) !== head))
          throw new Error("Incomplete comparison pagination");
        break;
      }
    }
    const watched = [b.sourcePath, ...b.watchedContractPaths];
    const relevant = (p: string) => watched.some((w) => p === w || p.startsWith(`${w}/`));
    const verifyFiles = treeCoverage(prefix, get);
    const changes: { commit: string; paths: string[] }[] = [];
    for (const commit of commits) {
      stage = "commit-files";
      const files = new Set<string>();
      const changedFiles = new Set<string>();
      let metadata: Record<string, any> = {};
      const paths = new Set<string>();
      for (let page = 1; ; page++) {
        if (page > bound.pages) throw new Error("Commit file page bound exhausted");
        const response = await get(`${prefix}/commits/${commit}?per_page=100&page=${page}`);
        const d = response.data;
        if (page === 1) metadata = d;
        if (sha(d.sha) !== commit || !Array.isArray(d.files) || d.files.length > 100)
          throw new Error("Incomplete commit file data");
        for (const item of d.files) {
          const f = object(item);
          const name = repoPath(f.filename);
          if (
            files.has(name) ||
            !["added", "removed", "modified", "renamed", "copied", "changed", "unchanged"].includes(
              f.status,
            )
          )
            throw new Error("Incomplete commit file data");
          files.add(name);
          changedFiles.add(name);
          if (relevant(name)) paths.add(name);
          if (f.status === "renamed" || f.status === "copied") {
            const previous = repoPath(f.previous_filename);
            if (f.status === "renamed") changedFiles.add(previous);
            if (relevant(previous)) paths.add(previous);
          }
        }
        // GitHub caps commit files at 3000. Complete trees below independently verify coverage.
        if (
          files.size >= bound.filesPerCommit ||
          (response.next && d.files.length !== 100) ||
          (page > 1 && d.files.length === 0)
        )
          throw new Error("Incomplete or bounded commit file coverage");
        if (!response.next) break;
      }
      stage = "tree-coverage";
      await verifyFiles(metadata, changedFiles);
      if (paths.size) changes.push({ commit, paths: [...paths].sort() });
    }
    return {
      status: changes.length ? "review-required" : "no-relevant-change",
      baseline,
      head,
      changes,
    };
  } catch (error) {
    const reason =
      error instanceof Error && safeReasons.has(error.message)
        ? error.message
        : "Missing or invalid baseline or upstream data";
    return {
      status: "inconclusive",
      reason,
      stage,
      ...(baseline ? { baseline } : {}),
      ...(head ? { head } : {}),
    };
  }
}
const safeReasons = new Set([
  "Comparison bound exhausted",
  "Comparison time bound exhausted",
  "Invalid comparison bounds",
  "Upstream request timed out",
  "Upstream access refused or rate limited",
  "Upstream unavailable",
  "Upstream network failure",
  "Upstream response bound exhausted",
  "Missing upstream body",
  "Invalid upstream UTF-8",
  "Invalid upstream JSON",
  "Invalid upstream pagination",
  "Incomplete upstream pagination",
  "Invalid upstream request",
  "Invalid upstream data",
  "Incomplete pagination data",
  "Invalid branch pagination",
  "Comparison page bound exhausted",
  "Baseline is not an ancestor of upstream head",
  "Incomplete comparison commit data",
  "Duplicate or invalid comparison commit",
  "Incomplete comparison pagination",
  "Commit file page bound exhausted",
  "Incomplete commit file data",
  "Incomplete or bounded commit file coverage",
  "Incomplete tree coverage",
  "Incomplete tree metadata",
  "Commit file list disagrees with complete trees",
]);

export function runOutput(result: CheckResult): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  if (result.status === "no-relevant-change") return { exitCode: 0, stdout: "", stderr: "" };
  if (result.status === "inconclusive")
    return { exitCode: 1, stdout: "", stderr: `${JSON.stringify(result)}\n` };
  return { exitCode: 0, stdout: `${JSON.stringify(result)}\n`, stderr: "" };
}
