import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Exercise the same checks and flags as test:bundle, without duplicating its list.
const packageDir = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
const [build, ...commands] = manifest.scripts["test:bundle"].split(" && ");
assert.equal(build, "bb plugin build");
assert.equal(commands.pop(), "node scripts/check-bundled-input-isolation.mjs");
assert.ok(commands.length > 0);
const checks = commands.map((command) => {
  assert.match(command, /^node scripts\/check-[\w-]+\.mjs(?: --[\w-]+)*$/);
  return command.slice("node ".length).split(" ");
});
const root = realpathSync(mkdtempSync(join(tmpdir(), "codex-bundle-isolation-")));
try {
  const home = join(root, "home"),
    inherited = join(root, "inherited-codex"),
    ambientRoots = [join(home, ".codex"), inherited];
  const fixture = readFileSync(new URL("../fixtures/native-legacy-usage.jsonl", import.meta.url));
  const sources = [];
  for (const nativeRoot of ambientRoots) {
    for (const directory of ["sessions", "archived_sessions"]) {
      mkdirSync(join(nativeRoot, directory), { recursive: true });
      const source = join(nativeRoot, directory, "ambient.jsonl");
      writeFileSync(source, fixture);
      sources.push(source);
    }
  }
  // Guard metadata discovery too. A swallowed native-reader error must still fail the child.
  const guard = `
    import assert from "node:assert/strict";
    import fs from "node:fs";
    import { syncBuiltinESMExports } from "node:module";
    import { resolve, sep } from "node:path";
    import { fileURLToPath } from "node:url";
    const roots = ${JSON.stringify(ambientRoots)};
    let attempts = 0;
    const verify = (path) => {
      if (typeof path === "number") return;
      const name = resolve(path instanceof URL ? fileURLToPath(path) : String(path));
      if (roots.some(root => name === root || name.startsWith(root + sep))) {
        attempts++;
        throw Error("Ambient native source access forbidden");
      }
    };
    for (const method of ["access", "lstat", "stat", "realpath", "opendir", "readdir", "open", "readFile"]) {
      const original = fs.promises[method];
      fs.promises[method] = (...args) => { verify(args[0]); return original(...args); };
      const sync = method + "Sync", originalSync = fs[sync];
      fs[sync] = (...args) => { verify(args[0]); return originalSync(...args); };
    }
    syncBuiltinESMExports();
    const priorHome = process.env.CODEX_HOME;
    process.on("exit", () => {
      assert.equal(attempts, 0, "No ambient native discovery or source reads");
      assert.equal(process.env.CODEX_HOME, priorHome, "Restore the caller's native root");
    });
  `;
  for (const mode of ["default-home", "inherited-home"]) {
    const env = { ...process.env, HOME: home };
    if (mode === "default-home") delete env.CODEX_HOME;
    else env.CODEX_HOME = inherited;
    for (const [script, ...flags] of checks) {
      const result = spawnSync(
        process.execPath,
        [
          `--import=data:text/javascript;base64,${Buffer.from(guard).toString("base64")}`,
          script,
          ...flags,
        ],
        {
          cwd: packageDir,
          env,
          encoding: "utf8",
          timeout: 120_000,
        },
      );
      assert.equal(
        result.status,
        0,
        `${mode}: ${script} ${flags.join(" ")}\n${result.error ?? ""}\n${result.stdout}\n${result.stderr}`,
      );
      for (const source of sources) assert.deepEqual(readFileSync(source), fixture);
    }
    console.log(
      `Bundled input isolation passed: ${checks.length} checks, ${mode}, no ambient native access, unchanged ambient fixtures, restored CODEX_HOME.`,
    );
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
