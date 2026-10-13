import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

// Run the public bundle commands, recording only roots allocated by each child.
const packageDir = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
const [build, ...commands] = manifest.scripts["test:bundle"].split(" && ");
assert.equal(build, "bb plugin build");
assert.equal(commands.pop(), "node scripts/check-bundled-input-isolation.mjs");
const root = realpathSync(mkdtempSync(join(tmpdir(), "codex-bundle-cleanup-")));
const results = [];
try {
  const sentinel = join(root, "not-a-fixture.txt");
  writeFileSync(sentinel, "Preserve unowned data");
  for (const [index, command] of commands.entries()) {
    assert.match(command, /^node scripts\/check-[\w-]+\.mjs(?: --[\w-]+)*$/);
    const temp = join(root, String(index));
    mkdirSync(temp);
    const ledger = join(root, `${index}.jsonl`);
    const guard = `
      import fs from "node:fs";
      import { syncBuiltinESMExports } from "node:module";
      import { resolve, sep } from "node:path";
      const roots = new Map();
      const record = (event) => fs.appendFileSync(${JSON.stringify(ledger)}, JSON.stringify({ pid: process.pid, ...event }) + "\\n");
      const create = fs.mkdtempSync;
      fs.mkdtempSync = (...args) => {
        const root = create(...args);
        roots.set(resolve(root), false);
        record({ event: "owned", root: resolve(root), birthtimeMs: fs.statSync(root).birthtimeMs });
        return root;
      };
      const createAsync = fs.promises.mkdtemp;
      fs.promises.mkdtemp = async (...args) => {
        const root = await createAsync(...args);
        roots.set(resolve(root), false);
        record({ event: "owned", root: resolve(root), birthtimeMs: fs.statSync(root).birthtimeMs });
        return root;
      };
      for (const method of ["mkdirSync", "writeFileSync", "rmSync"]) {
        const original = fs[method];
        fs[method] = (...args) => {
          const path = resolve(String(args[0]));
          for (const [root, removed] of roots) {
            if (path !== root && !path.startsWith(root + sep)) continue;
            if (method === "rmSync" && path === root) record({ event: "remove", root });
            else if (removed) record({ event: "late-write", root, path, method, stack: new Error().stack });
          }
          const result = original(...args);
          if (method === "rmSync" && roots.has(path)) roots.set(path, true);
          return result;
        };
      }
      syncBuiltinESMExports();
    `;
    const result = spawnSync(
      process.execPath,
      [
        `--import=data:text/javascript;base64,${Buffer.from(guard).toString("base64")}`,
        ...command.slice(5).split(" "),
      ],
      {
        cwd: packageDir,
        env: { ...process.env, TMPDIR: temp },
        encoding: "utf8",
        timeout: 120_000,
      },
    );
    const events = existsSync(ledger)
      ? readFileSync(ledger, "utf8").trim().split("\n").map(JSON.parse)
      : [];
    const owned = events.filter((event) => event.event === "owned");
    const absentAtCompletion = owned.every(({ root }) => !existsSync(root));
    await sleep(250);
    const absentAfterDelay = owned.every(({ root }) => !existsSync(root));
    const evidence = {
      command,
      exitCode: result.status,
      error: result.error?.message,
      owned,
      lateWrites: events.filter((event) => event.event === "late-write"),
      absentAtCompletion,
      absentAfterDelay,
    };
    results.push(evidence);
    console.log(JSON.stringify(evidence));
    assert.equal(
      result.status,
      0,
      `${command}\n${result.error ?? ""}\n${result.stdout}\n${result.stderr}`,
    );
    assert.ok(owned.length > 0, `${command}: fixture ownership recorded`);
  }
  assert.equal(readFileSync(sentinel, "utf8"), "Preserve unowned data");
  assert.ok(
    results.every((result) => result.absentAtCompletion),
    "Exact owned roots absent at command completion",
  );
  assert.ok(
    results.every((result) => result.absentAfterDelay),
    "Exact owned roots absent after 250ms",
  );
  assert.ok(
    results.every((result) => result.lateWrites.length === 0),
    "No writes after fixture deletion",
  );
  console.log(
    `Bundled cleanup passed: ${results.length} commands, natural child exit, exact owned roots absent immediately and after 250ms.`,
  );
} finally {
  // This observer owns its mkdtemp root, including any regression leftovers.
  rmSync(root, { recursive: true, force: true });
}
