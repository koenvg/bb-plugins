import { execFile } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { parseBaseline, type Baseline } from "./checker.ts";

const exec = promisify(execFile);
export const packageName = "bb-plugin-pi-subagents-provider";
export const prerequisites = ["UPSTREAM.json", "package.json", "src/upstream/checker.ts", "src/upstream/source.ts", "src/upstream/transport.ts", "src/upstream/trees.ts", "src/upstream/cli.ts"];
function isolatedGit(environment: NodeJS.ProcessEnv) {
  // Git's repository, index, object, discovery, and config overrides must not escape cwd.
  const env = Object.fromEntries(Object.entries(environment).filter(([key]) => !key.startsWith("GIT_")));
  Object.assign(env, { GIT_OPTIONAL_LOCKS: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" });
  return async (cwd: string, args: string[]) => {
    const result = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", ...args], {
      cwd, env, timeout: 5000, maxBuffer: 1024 * 1024,
    });
    return result.stdout;
  };
}
export async function readCommittedBaseline(packageDir: string, environment: NodeJS.ProcessEnv = process.env): Promise<Baseline> {
  const git = isolatedGit(environment);
  try {
    const dir = await realpath(packageDir);
    const root = (await git(dir, ["rev-parse", "--show-toplevel"])).trim();
    const file = relative(root, join(dir, "UPSTREAM.json")).split("\\").join("/");
    if (file.startsWith("../") || file.startsWith("/")) throw new Error();
    return parseBaseline(JSON.parse(await git(root, ["show", `HEAD:${file}`])));
  } catch { throw new Error("Missing or invalid committed baseline"); }
}
export type SourceInspection = { ready: true; root: string; packageDir: string; sourceRevision: string } | { ready: false; reason: string };

/** Only inspect. A durable source also needs an explicit server-host inventory attestation. */
export async function inspectStableSource(path: string, environment: NodeJS.ProcessEnv = process.env): Promise<SourceInspection> {
  const git = isolatedGit(environment);
  try {
    if (!isAbsolute(path) || /[\x00-\x1f\x7f]/.test(path)) throw new Error();
    const root = await realpath(path);
    if (root !== resolve(path) || /(?:^|\/)(?:worktrees|thr_[^/]+)(?:\/|$)/.test(root)) throw new Error();
    // A linked worktree has a .git file. Reject it even if its path looks permanent.
    if (!(await lstat(join(root, ".git"))).isDirectory()) throw new Error();
    if ((await git(root, ["rev-parse", "--show-toplevel"])).trim() !== root) throw new Error();
    const packageDir = join(root, packageName);
    for (const file of prerequisites) {
      if (!(await lstat(join(packageDir, file))).isFile() || await realpath(join(packageDir, file)) !== join(packageDir, file)) throw new Error();
      await git(root, ["cat-file", "-e", `HEAD:${packageName}/${file}`]);
      const actual = (await git(root, ["hash-object", "--no-filters", join(packageDir, file)])).trim();
      const committed = (await git(root, ["rev-parse", `HEAD:${packageName}/${file}`])).trim();
      if (actual !== committed) return { ready: false, reason: "Baseline or checker prerequisite bytes differ from committed source" };
    }
    const dirty = await git(root, ["status", "--porcelain=v1", "--untracked-files=all", "--", ...prerequisites.map((p) => `${packageName}/${p}`)]);
    if (dirty) return { ready: false, reason: "Baseline or checker prerequisites are uncommitted" };
    await readCommittedBaseline(packageDir, environment);
    return { ready: true, root, packageDir, sourceRevision: (await git(root, ["rev-parse", "HEAD"])).trim() };
  } catch { return { ready: false, reason: "Stable source or committed checker prerequisites are unavailable" }; }
}
