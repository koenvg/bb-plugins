import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, chmodSync, realpathSync, readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { readCommittedBaseline, inspectStableSource, prerequisites } from "./source.ts";

const owned: string[] = [];
function repo() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "bbp76-fixture-")); owned.push(root);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
  git("init", "-q"); git("config", "user.email", "fixture@example.test"); git("config", "user.name", "Fixture");
  const pkg = join(root, "bb-plugin-pi-subagents-provider");
  for (const file of prerequisites) { const path = join(pkg, file); mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, file === "UPSTREAM.json" ? JSON.stringify({ schemaVersion: 1, repository: "https://github.com/get-bb/bb.git", branch: "main", revision: "a".repeat(40), sourcePath: "plugins/provider-pi", watchedContractPaths: ["packages/plugin-sdk"] }) : "fixture\n"); }
  writeFileSync(join(root, "settings.json"), '{"owned":true}\n');
  git("add", "."); git("commit", "-qm", "fixture");
  return { root, pkg, git };
}
function bytes(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  function walk(p: string) { for (const e of readdirSync(p, { withFileTypes: true })) { const path = join(p, e.name); if (e.isDirectory()) walk(path); else out[path.slice(root.length)] = readFileSync(path).toString("hex"); } }
  walk(root); return out;
}
async function plannedWrapper(root: string) {
  const { planWeeklyCheck } = await import("./setup.ts");
  const plan = await planWeeklyCheck({ projectId: "proj_fixture", serverHostId: "host_fixture" }, {
    sources: async () => ({ complete: true, records: [{ projectId: "proj_fixture", hostId: "host_fixture", path: root, kind: "project-source", expiresAt: null, durable: true }] }),
    inspect: inspectStableSource, schedules: async () => ({ complete: true, records: [] }),
  });
  if (plan.action !== "create-after-approval") throw new Error("Expected owned fixture wrapper plan");
  return plan.script;
}
afterEach(() => { vi.unstubAllEnvs(); for (const path of owned.splice(0)) rmSync(path, { recursive: true, force: true }); });

it("reads committed provenance while preserving every dirty byte and Git state", async () => {
  const r = repo();
  writeFileSync(join(r.pkg, "UPSTREAM.json"), "dirty invalid baseline");
  writeFileSync(join(r.root, "settings.json"), "dirty settings");
  writeFileSync(join(r.root, "staged.txt"), "staged"); r.git("add", "staged.txt");
  writeFileSync(join(r.root, "untracked.txt"), "untracked");
  const before = bytes(r.root);
  expect((await readCommittedBaseline(r.pkg)).revision).toBe("a".repeat(40));
  expect(await inspectStableSource(r.root)).toMatchObject({ ready: false });
  expect(bytes(r.root)).toEqual(before);
});

it("accepts a committed ordinary checkout and rejects missing or uncommitted prerequisites", async () => {
  const r = repo();
  const before = bytes(r.root);
  expect(await inspectStableSource(r.root)).toMatchObject({ ready: true, root: r.root, packageDir: r.pkg });
  expect(bytes(r.root)).toEqual(before);
  for (const file of ["UPSTREAM.json", "src/upstream/checker.ts"]) {
    rmSync(join(r.pkg, file));
    expect(await inspectStableSource(r.root)).toMatchObject({ ready: false });
    r.git("checkout", "--", `bb-plugin-pi-subagents-provider/${file}`);
    writeFileSync(join(r.pkg, file), "uncommitted");
    expect(await inspectStableSource(r.root)).toMatchObject({ ready: false });
    r.git("checkout", "--", `bb-plugin-pi-subagents-provider/${file}`);
  }
  r.git("rm", "-q", "bb-plugin-pi-subagents-provider/UPSTREAM.json"); r.git("commit", "-qm", "missing baseline");
  await expect(readCommittedBaseline(r.pkg)).rejects.toThrow("committed baseline");
});

it("runs the checker against committed data without changing dirty source, dependencies, or owned settings", async () => {
  const r = repo();
  writeFileSync(join(r.pkg, "UPSTREAM.json"), "dirty baseline");
  writeFileSync(join(r.pkg, "package-lock.json"), "owned dependency fixture");
  mkdirSync(join(r.pkg, "node_modules")); writeFileSync(join(r.pkg, "node_modules/fixture"), "owned dependencies");
  writeFileSync(join(r.root, "settings.json"), "dirty owned settings");
  const before = bytes(r.root);
  const { checkerCommand } = await import("./cli.ts");
  const revision = "a".repeat(40);
  const output = await checkerCommand(["--source", r.pkg, "--project", "proj_fixture"], { now: () => 0, nodeVersion: "24.15.0", transport: async (p) => ({ status: 200, next: false, data: p.includes("branches") ? { commit: { sha: revision } } : {
    status: "identical", base_commit: { sha: revision }, merge_base_commit: { sha: revision }, total_commits: 0, ahead_by: 0, commits: [],
  } }) });
  expect(output).toEqual({ exitCode: 0, stdout: "", stderr: "" });
  expect(bytes(r.root)).toEqual(before);
});

it("rejects linked worktrees even with a permanent-looking name", async () => {
  const r = repo(); const linked = `${r.root}-linked`; owned.push(linked);
  r.git("worktree", "add", "-q", "--detach", linked);
  expect(await inspectStableSource(linked)).toMatchObject({ ready: false });
});

it("validates the copied wrapper before invoking only an owned fake Node command", async () => {
  const r = repo();
  const wrapper = join(r.root, "wrapper.sh");
  writeFileSync(wrapper, await plannedWrapper(r.root));
  const bin = join(r.root, "owned-bin"); mkdirSync(bin);
  const fakeNode = join(bin, "node"); writeFileSync(fakeNode, '#!/bin/bash\nprintf "fixture-checker-only\\n"\n'); chmodSync(fakeNode, 0o700);
  const env = { ...process.env, BB_PROJECT_ID: "proj_fixture", PATH: `${bin}:${process.env.PATH}` };
  const before = bytes(r.root);
  const ok = spawnSync("bash", [wrapper], { env, encoding: "utf8" });
  expect(ok.status).toBe(0); expect(ok.stdout).toBe("fixture-checker-only\n");
  expect(bytes(r.root)).toEqual(before);
  writeFileSync(join(r.pkg, "src/upstream/checker.ts"), "dirty checker");
  const dirtyBefore = bytes(r.root);
  const blocked = spawnSync("bash", [wrapper], { env, encoding: "utf8" });
  expect(blocked.status).toBe(1); expect(blocked.stdout).toBe(""); expect(blocked.stderr).toContain("inconclusive");
  expect(bytes(r.root)).toEqual(dirtyBefore);
  const wrong = spawnSync("bash", [wrapper], { env: { ...env, BB_PROJECT_ID: "proj_other" }, encoding: "utf8" });
  expect(wrong.status).toBe(1); expect(wrong.stdout).toBe("");
});

it("rejects dirty checker bytes hidden from Git status by index flags", async () => {
  const r = repo();
  r.git("update-index", "--assume-unchanged", "bb-plugin-pi-subagents-provider/src/upstream/checker.ts");
  writeFileSync(join(r.pkg, "src/upstream/checker.ts"), "hidden dirty checker");
  const before = bytes(r.root);
  expect(await inspectStableSource(r.root)).toMatchObject({ ready: false });
  expect(bytes(r.root)).toEqual(before);
});

it("uses only the requested checkout despite inherited Git repository and object overrides", async () => {
  const r = repo(); const other = repo();
  const otherBaseline = JSON.parse(readFileSync(join(other.pkg, "UPSTREAM.json"), "utf8"));
  otherBaseline.revision = "b".repeat(40);
  writeFileSync(join(other.pkg, "UPSTREAM.json"), JSON.stringify(otherBaseline));
  other.git("add", "."); other.git("commit", "-qm", "foreign baseline");
  const environment = { ...process.env, GIT_DIR: join(other.root, ".git"), GIT_WORK_TREE: r.root,
    GIT_COMMON_DIR: join(other.root, ".git"), GIT_OBJECT_DIRECTORY: join(other.root, ".git/objects"),
    GIT_ALTERNATE_OBJECT_DIRECTORIES: join(other.root, ".git/objects"), GIT_NAMESPACE: "foreign" };
  const before = bytes(r.root); const foreignBefore = bytes(other.root);
  for (const [key, value] of Object.entries(environment)) if (key.startsWith("GIT_")) vi.stubEnv(key, value);
  expect((await readCommittedBaseline(r.pkg, environment)).revision).toBe("a".repeat(40));
  expect((await readCommittedBaseline(r.pkg)).revision).toBe("a".repeat(40));
  expect(await inspectStableSource(r.root, environment)).toMatchObject({ ready: true });
  expect(bytes(r.root)).toEqual(before); expect(bytes(other.root)).toEqual(foreignBefore);
});

it("does not let an alternate index hide staged prerequisite changes", async () => {
  const r = repo();
  const original = readFileSync(join(r.pkg, "UPSTREAM.json"));
  const alternateIndex = join(r.root, "alternate-index");
  writeFileSync(alternateIndex, readFileSync(join(r.root, ".git/index")));
  writeFileSync(join(r.pkg, "UPSTREAM.json"), "staged prerequisite change");
  r.git("add", "bb-plugin-pi-subagents-provider/UPSTREAM.json");
  writeFileSync(join(r.pkg, "UPSTREAM.json"), original);
  const before = bytes(r.root);
  vi.stubEnv("GIT_INDEX_FILE", alternateIndex);
  expect(await inspectStableSource(r.root, { ...process.env, GIT_INDEX_FILE: alternateIndex })).toMatchObject({ ready: false });
  expect(bytes(r.root)).toEqual(before);
});

it("copied wrappers ignore foreign Git contexts and use the real source index", async () => {
  const r = repo(); const other = repo();
  const wrapper = join(r.root, "wrapper.sh"); writeFileSync(wrapper, await plannedWrapper(r.root));
  const bin = join(r.root, "owned-bin"); mkdirSync(bin);
  const fakeNode = join(bin, "node");
  writeFileSync(fakeNode, '#!/bin/bash\n[ -z "${GIT_DIR:-}${GIT_INDEX_FILE:-}${GIT_OBJECT_DIRECTORY:-}${GIT_FUTURE_SELECTION:-}" ] || exit 4\nprintf "fixture-checker-only\\n"\n'); chmodSync(fakeNode, 0o700);
  const environment = { ...process.env, BB_PROJECT_ID: "proj_fixture", PATH: `${bin}:${process.env.PATH}`,
    GIT_DIR: join(other.root, ".git"), GIT_WORK_TREE: r.root, GIT_COMMON_DIR: join(other.root, ".git"),
    GIT_OBJECT_DIRECTORY: join(other.root, ".git/objects"), GIT_ALTERNATE_OBJECT_DIRECTORIES: join(other.root, ".git/objects"),
    GIT_FUTURE_SELECTION: "foreign" };
  const before = bytes(r.root); const foreignBefore = bytes(other.root);
  const ok = spawnSync("bash", [wrapper], { env: environment, encoding: "utf8" });
  expect(ok.status).toBe(0); expect(ok.stdout).toBe("fixture-checker-only\n");
  expect(bytes(r.root)).toEqual(before); expect(bytes(other.root)).toEqual(foreignBefore);
  const original = readFileSync(join(r.pkg, "UPSTREAM.json"));
  const alternateIndex = join(r.root, "alternate-index");
  writeFileSync(alternateIndex, readFileSync(join(r.root, ".git/index")));
  writeFileSync(join(r.pkg, "UPSTREAM.json"), "staged prerequisite change");
  r.git("add", "bb-plugin-pi-subagents-provider/UPSTREAM.json"); writeFileSync(join(r.pkg, "UPSTREAM.json"), original);
  const dirtyBefore = bytes(r.root);
  const blocked = spawnSync("bash", [wrapper], { env: { ...environment, GIT_INDEX_FILE: alternateIndex }, encoding: "utf8" });
  expect(blocked.status).toBe(1); expect(blocked.stdout).toBe(""); expect(blocked.stderr).toContain("inconclusive");
  expect(bytes(r.root)).toEqual(dirtyBefore); expect(bytes(other.root)).toEqual(foreignBefore);
});
