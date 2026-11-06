import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const sdk = "@get-bb/plugin-sdk";
const alias = "@get-bb/plugin-sdk-runtime";
const names = ["bb-plugin-alpha", "bb-plugin-beta"];

function fixture(t) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "bb sdk ")));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const root = join(home, "owned checkout with spaces");
  const bin = join(home, "bin");
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(bin);
  if (existsSync(join(repository, "scripts/sdk.mjs"))) {
    copyFileSync(join(repository, "scripts/sdk.mjs"), join(root, "scripts/sdk.mjs"));
  }
  const json = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
  json(join(root, "package.json"), {
    private: true,
    workspaces: ["bb-plugin-*", "packages/*"],
    scripts: { "check:review": "bun --no-install scripts/checks.mjs review" },
  });
  for (const name of names) {
    mkdirSync(join(root, name));
    json(join(root, name, "package.json"), {
      name,
      private: true,
      description: "Keep the complete manifest",
      bb: { name, app: "./app.tsx", server: "./server.ts" },
      engines: { bb: ">=0.48 <0.49", bbPluginSdk: ">=0.6.49 <0.7", node: ">=26" },
      scripts: { test: "reviewed-test", typecheck: "reviewed-typecheck", build: "bb plugin build" },
      dependencies: name === names[0] ? { [alias]: `npm:${sdk}@0.6.49` } : {},
      devDependencies: { [sdk]: "0.6.49", sonner: "^1.7.4", unrelated: "1.0.0" },
    });
    json(join(root, name, "tsconfig.json"), { compilerOptions: { strict: true } });
  }
  writeFileSync(join(root, "bun.lock"), "original root lock\n");
  writeFileSync(join(root, "configuration.json"), '{"enabled":false,"secret":"fixture"}\n');
  writeFileSync(join(root, "tasks.json"), '[{"id":"owned-fixture","state":"open"}]\n');
  const tracePath = join(home, "commands.jsonl");
  const stub = `#!${process.execPath}
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
const args = process.argv.slice(2);
const command = basename(process.argv[1]);
const options = JSON.parse(process.env.SDK_CASE);
appendFileSync(process.env.SDK_TRACE, JSON.stringify({ command, args, cwd: process.cwd() }) + "\\n");
const fail = (code, message) => { console.error(message); process.exit(code); };
if (command === "bb" && args.join(" ") === "--version") {
  console.log(options.bb ?? "0.48.1");
} else if (command === "bb" && args[0] === "plugin" && args[1] === "types") {
  const path = args[2];
  const file = join(path, "package.json");
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  if (typeof pkg.bb?.server !== "string") fail(32, "Plugin manifest requires a string bb.server");
  const target = options.sdk ?? "0.6.104";
  const tsconfig = join(path, "tsconfig.json");
  if (existsSync(join(path, "types/bb-plugin-sdk.d.ts")) ||
      existsSync(join(path, "types/bb-plugin-sdk-app.d.ts")) ||
      (existsSync(tsconfig) && readFileSync(tsconfig, "utf8").includes("types/bb-plugin-sdk"))) {
    fail(33, "Legacy vendored layout requires migration");
  }
  if (!pkg.bb || pkg.description !== "Keep the complete manifest" || !pkg.engines.node) {
    fail(34, "Projection lost complete manifest inputs");
  }
  if (args[3] === "--check") {
    console.log("pin=" + pkg.devDependencies["@get-bb/plugin-sdk"] + " host=" + target);
    if (options.diagnostic) fail(35, options.diagnostic);
    if (pkg.devDependencies["@get-bb/plugin-sdk"] !== target || pkg.devDependencies.sonner !== "^2.0.7") {
      fail(12, "Official SDK and shim declarations need synchronization");
    }
    if (options.postcheckExit && path.startsWith(process.env.SDK_ROOT)) {
      fail(options.postcheckExit, "Official API diagnostic");
    }
  } else {
    if (options.diagnostic) fail(35, options.diagnostic);
    if (options.syncExit && path.startsWith(process.env.SDK_ROOT)) fail(options.syncExit, "Sync failed");
    pkg.devDependencies["@get-bb/plugin-sdk"] = target;
    pkg.devDependencies.sonner = "^2.0.7";
    if (options.unrelated) pkg.engines.bb = "*";
    writeFileSync(file, JSON.stringify(pkg, null, 2) + "\\n");
    console.log("Synchronized SDK " + target);
  }
} else if (command === "bb" && args[0] === "plugin" && args[1] === "build") {
  if (options.buildExit) fail(options.buildExit, "Build failed");
  console.log("Built selected plugin");
} else if (command === "bun" && args[0] === "install") {
  if (args.join(" ") !== "install --ignore-scripts" || process.env.NODE_ENV !== "development") {
    fail(91, "Unsafe dependency reconciliation");
  }
  writeFileSync(join(process.cwd(), "bun.lock"), "reconciled root lock\\n");
  if (options.installExit) fail(options.installExit, "Dependency reconciliation failed");
} else if (command === "bun" && args.slice(0, 3).join(" ") === "--no-install run check:review") {
  if (options.reviewExit) fail(options.reviewExit, "Review validation failed");
  const evidence = args[args.indexOf("--evidence") + 1];
  mkdirSync(evidence);
  writeFileSync(join(evidence, "summary.json"), '{"passed":true}\\n');
} else if (command === "bun" && args[0] === "--no-install" && args[1] === "run") {
  if (options.sharedExit) fail(options.sharedExit, "Shared prerequisite failed");
  console.log("Shared prerequisite passed");
} else if (command === "sqlite3" && args[0] === "--version") {
  console.log("3.fixture");
} else {
  fail(99, "Forbidden external command: " + command + " " + args.join(" "));
}
`;
  for (const name of ["bb", "bun", "sqlite3"])
    writeFileSync(join(bin, name), stub, { mode: 0o755 });
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "--quiet");
  const commit = () => {
    git("add", ".");
    git(
      "-c",
      "user.name=SDK fixture",
      "-c",
      "user.email=sdk@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "fixture",
    );
  };
  commit();
  return {
    root,
    home,
    git,
    commit,
    json,
    manifest(name = names[0]) {
      return JSON.parse(readFileSync(join(root, name, "package.json"), "utf8"));
    },
    read(path) {
      return readFileSync(join(root, path), "utf8");
    },
    trace() {
      return existsSync(tracePath)
        ? readFileSync(tracePath, "utf8").trim().split("\n").map(JSON.parse)
        : [];
    },
    run(args, options = {}, cwd = root) {
      const child = spawnSync(
        process.execPath,
        ["--no-install", join(root, "scripts/sdk.mjs"), ...args],
        {
          cwd,
          encoding: "utf8",
          timeout: 30_000,
          env: {
            ...process.env,
            PATH: bin + ":" + process.env.PATH,
            SDK_ROOT: root,
            SDK_TRACE: tracePath,
            SDK_CASE: JSON.stringify(options),
          },
        },
      );
      return { ...child, report: child.stdout.trim() ? JSON.parse(child.stdout) : null };
    },
    align(extra = []) {
      return ["align", "--owned-checkout", root, "--package", names[0], ...extra];
    },
    apply(extra = []) {
      return this.align(["--apply", "--evidence", join(home, "review evidence"), ...extra]);
    },
    preserved() {
      assert.equal(this.read("configuration.json"), '{"enabled":false,"secret":"fixture"}\n');
      assert.equal(this.read("tasks.json"), '[{"id":"owned-fixture","state":"open"}]\n');
      assert.deepEqual(
        this.trace()
          .filter(({ command }) => command === "bb")
          .map(({ args }) => (args[0] === "--version" ? "version" : args.slice(0, 2).join(" ")))
          .filter((action) => !["version", "plugin types", "plugin build"].includes(action)),
        [],
      );
    },
  };
}

function success(result) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.report.error, null);
}

test("audit retains matching official diagnostics and committed checkout identity without writes", (t) => {
  const f = fixture(t);
  for (const name of names) {
    const pkg = f.manifest(name);
    pkg.devDependencies[sdk] = "0.6.104";
    pkg.devDependencies.sonner = "^2.0.7";
    if (pkg.dependencies[alias]) pkg.dependencies[alias] = `npm:${sdk}@0.6.104`;
    f.json(join(f.root, name, "package.json"), pkg);
  }
  f.commit();
  const result = f.run(["audit"]);
  success(result);
  const checkout = result.report.checkouts[0];
  assert.equal(checkout.path, f.root);
  assert.equal(checkout.head, f.git("rev-parse", "HEAD"));
  assert.equal(checkout.dirty, false);
  assert.deepEqual(
    checkout.packages.map(({ directory, status }) => [directory, status]),
    names.map((name) => [name, "current"]),
  );
  assert.equal(checkout.packages[0].committed.sdk, "0.6.104");
  assert.equal(checkout.packages[0].official.exitCode, 0);
  assert.equal(checkout.packages[0].official.stdout, "pin=0.6.104 host=0.6.104\n");
  assert.equal(checkout.packages[0].official.stderr, "");
  assert.equal(f.git("status", "--porcelain"), "");
  assert.equal(f.read("bun.lock"), "original root lock\n");
  f.preserved();
});

test("host change is reported before installation and is not classified as harmless", (t) => {
  const f = fixture(t);
  const result = f.run(["audit", "--package", names[0]], { sdk: "0.6.105" });
  assert.equal(result.status, 1);
  const pkg = result.report.checkouts[0].packages[0];
  assert.equal(pkg.directory, names[0]);
  assert.equal(pkg.name, names[0]);
  assert.equal(pkg.committed.runtimeAlias, `npm:${sdk}@0.6.49`);
  assert.equal(pkg.status, "needs-attention");
  assert.equal(pkg.official.exitCode, 12);
  assert.equal(pkg.official.stdout, "pin=0.6.49 host=0.6.105\n");
  assert.equal(pkg.official.stderr, "Official SDK and shim declarations need synchronization\n");
  assert.equal(f.git("status", "--porcelain"), "");
  assert.deepEqual(
    f.trace().map(({ command }) => command),
    ["bb", "bb"],
  );
  f.preserved();
});

test("preview projects SDK, shim and existing alias changes without checkout writes", (t) => {
  const f = fixture(t);
  const result = f.run(["align", "--package", names[0]]);
  success(result);
  assert.equal(result.report.kind, "preview");
  assert.equal(result.report.lockfile, "resolution-required-on-apply");
  assert.deepEqual(result.report.projections[0].changes, [
    { field: `dependencies.${alias}`, from: `npm:${sdk}@0.6.49`, to: `npm:${sdk}@0.6.104` },
    { field: `devDependencies.${sdk}`, from: "0.6.49", to: "0.6.104" },
    { field: "devDependencies.sonner", from: "^1.7.4", to: "^2.0.7" },
  ]);
  assert.equal(result.report.checkouts[0].packages[0].official.exitCode, 12);
  assert.equal(f.git("status", "--porcelain"), "");
  assert.equal(f.read("bun.lock"), "original root lock\n");
  assert.equal(f.manifest().devDependencies[sdk], "0.6.49");
  assert.equal(
    f.trace().some(({ command }) => command === "bun"),
    false,
  );
  const projection = f.trace().find(({ args }) => args[1] === "types" && args.length === 3);
  assert.equal(projection.args[2].startsWith(f.root), false);
  assert.equal(existsSync(projection.args[2]), false);
  assert.equal(
    result.report.stages.every(({ status }) => status === "skipped"),
    true,
  );
  f.preserved();
});

test("explicit apply fixes ordinary drift, reconciles once and validates only selected packages", (t) => {
  const f = fixture(t);
  const original = f.manifest();
  const unselected = f.read(`${names[1]}/package.json`);
  const result = f.run(f.apply());
  success(result);
  assert.equal(result.report.kind, "apply");
  assert.equal(result.report.checkouts[0].dirty, false);
  assert.equal(result.report.checkouts[0].packages[0].official.exitCode, 12);
  original.dependencies[alias] = `npm:${sdk}@0.6.104`;
  original.devDependencies[sdk] = "0.6.104";
  original.devDependencies.sonner = "^2.0.7";
  assert.deepEqual(f.manifest(), original);
  assert.equal(f.read(`${names[1]}/package.json`), unselected);
  assert.equal(f.read("bun.lock"), "reconciled root lock\n");
  assert.equal(f.git("diff", "--name-only"), `${names[0]}/package.json\nbun.lock`);
  assert.equal(
    result.report.stages.every(({ status }) => status === "passed"),
    true,
  );
  assert.deepEqual(
    f
      .trace()
      .filter(({ command }) => command === "bun")
      .map(({ args, cwd }) => ({ args, cwd })),
    [
      { args: ["install", "--ignore-scripts"], cwd: f.root },
      {
        args: [
          "--no-install",
          "run",
          "check:review",
          "--evidence",
          join(f.home, "review evidence"),
          "--package",
          names[0],
        ],
        cwd: f.root,
      },
    ],
  );
  assert.deepEqual(
    f
      .trace()
      .filter(({ args }) => args[1] === "build")
      .map(({ args }) => args),
    [["plugin", "build", join(f.root, names[0])]],
  );
  assert.match(result.report.diff, /reconciled root lock/);
  assert.match(result.report.diff, /0\.6\.104/);
  assert.equal(
    JSON.parse(readFileSync(join(f.home, "review evidence/summary.json"), "utf8")).passed,
    true,
  );
  f.preserved();
});

test("multiple selections are all projected and admitted before any real writes", (t) => {
  const f = fixture(t);
  const pkg = f.manifest(names[1]);
  pkg.engines.bbPluginSdk = ">=0.7";
  f.json(join(f.root, names[1], "package.json"), pkg);
  f.commit();
  const result = f.run(f.apply(["--package", names[1]]));
  assert.equal(result.status, 1);
  assert.match(result.report.error, /engine.*bbPluginSdk/i);
  assert.equal(f.git("status", "--porcelain"), "");
  assert.equal(
    f
      .trace()
      .some(({ args }) => args[1] === "types" && args.length === 3 && args[2].startsWith(f.root)),
    false,
  );
  assert.equal(
    f.trace().some(({ command }) => command === "bun"),
    false,
  );
  f.preserved();
});

for (const [options, message] of [
  [{ bb: "0.49.0" }, /engine.*bb/i],
  [{ diagnostic: "SDK API is incompatible" }, /projection/i],
  [{ unrelated: true }, /unrelated|engines/i],
]) {
  test(`preflight blocks without writes for ${JSON.stringify(options)}`, (t) => {
    const f = fixture(t);
    const result = f.run(f.apply(), options);
    assert.equal(result.status, 1);
    assert.match(result.report.error, message);
    assert.equal(f.git("status", "--porcelain"), "");
    assert.equal(f.read("bun.lock"), "original root lock\n");
    assert.equal(
      f.trace().some(({ command }) => command === "bun"),
      false,
    );
    f.preserved();
  });
}

for (const input of ["sentinel", "tsconfig"]) {
  test(`projection retains ${input} migration inputs`, (t) => {
    const f = fixture(t);
    if (input === "sentinel") {
      mkdirSync(join(f.root, names[0], "types"));
      writeFileSync(join(f.root, names[0], "types/bb-plugin-sdk.d.ts"), "legacy declaration\n");
    } else {
      f.json(join(f.root, names[0], "tsconfig.json"), {
        compilerOptions: { paths: { [sdk]: ["./types/bb-plugin-sdk.d.ts"] } },
      });
    }
    f.commit();
    const result = f.run(["align", "--package", names[0]]);
    assert.equal(result.status, 1);
    assert.match(result.report.error, /projection/i);
    assert.equal(result.report.projections[0].official.exitCode, 33);
    assert.equal(
      result.report.projections[0].official.stderr,
      "Legacy vendored layout requires migration\n",
    );
    assert.equal(f.git("status", "--porcelain"), "");
    f.preserved();
  });
}

for (const [options, failed, changed] of [
  [{ syncExit: 36 }, `sync:${names[0]}`, ""],
  [{ installExit: 37 }, "lockfile", `${names[0]}/package.json\nbun.lock`],
  [{ postcheckExit: 38 }, `postcheck:${names[0]}`, `${names[0]}/package.json\nbun.lock`],
  [{ reviewExit: 39 }, "review", `${names[0]}/package.json\nbun.lock`],
  [{ buildExit: 40 }, `build:${names[0]}`, `${names[0]}/package.json\nbun.lock`],
]) {
  test(`apply preserves failed ${failed} and partial changes without recovery`, (t) => {
    const f = fixture(t);
    const result = f.run(f.apply(), options);
    assert.equal(result.status, 1);
    assert.match(result.report.error, /failed/i);
    const index = result.report.stages.findIndex(({ id }) => id === failed);
    assert.notEqual(index, -1);
    assert.equal(result.report.stages[index].status, "failed");
    assert.equal(result.report.stages[index].result.exitCode, Object.values(options)[0]);
    assert.equal(
      result.report.stages.slice(index + 1).every(({ status }) => status === "skipped"),
      true,
    );
    assert.equal(f.git("diff", "--name-only"), changed);
    assert.equal(
      f.trace().filter(({ command, args }) => command === "bun" && args[0] === "install").length,
      failed.startsWith("sync:") ? 0 : 1,
    );
    f.preserved();
  });
}

test("invalid, duplicate, missing, escaping and foreign apply authority never writes", (t) => {
  const f = fixture(t);
  for (const args of [
    ["align"],
    ["align", "--apply", "--package", names[0]],
    ["align", "--package"],
    f.apply(["--all-worktrees"]),
    f.apply(["--package", names[0]]),
    [
      "align",
      "--owned-checkout",
      f.home,
      "--apply",
      "--evidence",
      join(f.home, "evidence"),
      "--package",
      names[0],
    ],
    ...[
      "bb-plugin-missing",
      "../bb-plugin-alpha",
      "bb-plugin-beta/../bb-plugin-alpha",
      join(f.root, names[0]),
    ].map((name) => [
      "align",
      "--owned-checkout",
      f.root,
      "--apply",
      "--evidence",
      join(f.home, "evidence"),
      "--package",
      name,
    ]),
  ]) {
    const result = f.run(args);
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.equal(typeof result.report.error, "string");
    assert.equal(f.git("status", "--porcelain"), "");
  }
  assert.equal(
    f.trace().some(({ command }) => command === "bun"),
    false,
  );
  assert.equal(
    f.trace().some(({ args }) => args[1] === "types" && args.length === 3),
    false,
  );
  f.preserved();
});

for (const dirty of ["tracked", "untracked", "git-operation"]) {
  test(`apply rejects ${dirty} checkout state`, (t) => {
    const f = fixture(t);
    if (dirty === "tracked") writeFileSync(join(f.root, "tasks.json"), "keep dirty data\n");
    if (dirty === "untracked")
      writeFileSync(join(f.root, "untracked.txt"), "keep untracked data\n");
    if (dirty === "git-operation")
      writeFileSync(join(f.root, ".git/MERGE_HEAD"), f.git("rev-parse", "HEAD") + "\n");
    const before = f.git("status", "--porcelain");
    const result = f.run(f.apply());
    assert.equal(result.status, 1);
    assert.match(result.report.error, /clean|Git operation/i);
    assert.equal(f.git("status", "--porcelain"), before);
    assert.equal(f.read("bun.lock"), "original root lock\n");
    assert.equal(
      f.trace().some(({ command }) => command === "bun"),
      false,
    );
    if (dirty === "tracked") assert.equal(f.read("tasks.json"), "keep dirty data\n");
    else f.preserved();
  });
}

test("all-worktree audit reports dirty and missing worktrees but apply leaves them untouched", (t) => {
  const f = fixture(t);
  const other = join(f.home, "other thread checkout");
  const missing = join(f.home, "missing checkout");
  f.git("worktree", "add", "--quiet", "--detach", other, "HEAD");
  f.git("worktree", "add", "--quiet", "--detach", missing, "HEAD");
  rmSync(missing, { recursive: true });
  writeFileSync(join(other, "tasks.json"), "other thread work\n");
  const otherManifest = readFileSync(join(other, names[0], "package.json"), "utf8");
  const audit = f.run(["audit", "--all-worktrees"]);
  assert.equal(audit.status, 1);
  assert.equal(audit.report.checkouts.length, 3);
  assert.equal(audit.report.checkouts.find(({ path }) => path === other).dirty, true);
  assert.match(audit.report.checkouts.find(({ path }) => path === missing).error, /ENOENT/);
  success(f.run(f.apply()));
  assert.equal(readFileSync(join(other, names[0], "package.json"), "utf8"), otherManifest);
  assert.equal(readFileSync(join(other, "bun.lock"), "utf8"), "original root lock\n");
  assert.equal(readFileSync(join(other, "tasks.json"), "utf8"), "other thread work\n");
  const foreign = f.run(f.apply(), {}, other);
  assert.equal(foreign.status, 1);
  assert.match(foreign.report.error, /current|owned/i);
  f.preserved();
});

test("multiple selected packages align without inventing a runtime alias", (t) => {
  const f = fixture(t);
  success(f.run(f.apply(["--package", names[1]])));
  assert.equal(f.manifest(names[1]).devDependencies[sdk], "0.6.104");
  assert.deepEqual(f.manifest(names[1]).dependencies, {});
  const trace = f.trace();
  const synchronizations = trace.filter(({ args }) => args[1] === "types" && args.length === 3);
  assert.deepEqual(
    synchronizations.map(({ args }) => args[2].startsWith(f.root)),
    [false, false, true, true],
  );
  assert.equal(
    trace.filter(({ command, args }) => command === "bun" && args[0] === "install").length,
    1,
  );
  assert.deepEqual(
    trace.filter(({ args }) => args[1] === "build").map(({ args }) => args[2]),
    names.map((name) => join(f.root, name)),
  );
  f.preserved();
});

test("missing required engine range blocks before writes", (t) => {
  const f = fixture(t);
  const pkg = f.manifest();
  delete pkg.engines.bb;
  f.json(join(f.root, names[0], "package.json"), pkg);
  f.commit();
  const result = f.run(f.apply());
  assert.equal(result.status, 1);
  assert.match(result.report.error, /engine bb/);
  assert.equal(f.git("status", "--porcelain"), "");
  f.preserved();
});

for (const fail of [false, true]) {
  test(`document consumer runs required local prerequisites before review and builds, failure=${fail}`, (t) => {
    const f = fixture(t);
    const pkg = f.manifest();
    pkg.dependencies["@bb-plugins/markdown-document"] = "workspace:*";
    f.json(join(f.root, names[0], "package.json"), pkg);
    f.git("mv", names[0], "bb-plugin-tasks-plus");
    mkdirSync(join(f.root, "packages/markdown-document"), { recursive: true });
    f.json(join(f.root, "packages/markdown-document/package.json"), {
      name: "@bb-plugins/markdown-document",
      scripts: { build: "reviewed-build", test: "reviewed-tests", typecheck: "reviewed-typecheck" },
    });
    f.commit();
    const result = f.run(
      [
        "align",
        "--owned-checkout",
        f.root,
        "--package",
        "bb-plugin-tasks-plus",
        "--apply",
        "--evidence",
        join(f.home, "review evidence"),
      ],
      fail ? { sharedExit: 45 } : {},
    );
    assert.equal(result.status, fail ? 1 : 0);
    const ids = result.report.stages.map(({ id, status }) => [id, status]);
    assert.deepEqual(ids, [
      ["sync:bb-plugin-tasks-plus", "passed"],
      ["lockfile", "passed"],
      ["postcheck:bb-plugin-tasks-plus", "passed"],
      ["sqlite", "passed"],
      ["shared:build", fail ? "failed" : "passed"],
      ["shared:test", fail ? "skipped" : "passed"],
      ["shared:typecheck", fail ? "skipped" : "passed"],
      ["review", fail ? "skipped" : "passed"],
      ["build:bb-plugin-tasks-plus", fail ? "skipped" : "passed"],
    ]);
    if (!fail)
      assert.deepEqual(
        f
          .trace()
          .filter(({ cwd }) => cwd.endsWith("packages/markdown-document"))
          .map(({ args }) => args),
        [
          ["--no-install", "run", "build"],
          ["--no-install", "run", "test", "--maxWorkers=1"],
          ["--no-install", "run", "typecheck"],
        ],
      );
    f.preserved();
  });
}

test("apply rejects evidence inside any checkout and preserves existing evidence", (t) => {
  const f = fixture(t);
  const existing = join(f.home, "existing evidence");
  mkdirSync(existing);
  writeFileSync(join(existing, "keep"), "retain evidence\n");
  const other = join(f.home, "other source");
  f.git("worktree", "add", "--quiet", "--detach", other, "HEAD");
  for (const evidence of [join(f.root, "evidence"), join(other, "evidence"), existing]) {
    const result = f.run([
      "align",
      "--owned-checkout",
      f.root,
      "--package",
      names[0],
      "--apply",
      "--evidence",
      evidence,
    ]);
    assert.equal(result.status, 1);
    assert.match(result.report.error, /outside|new directory/);
  }
  assert.equal(readFileSync(join(existing, "keep"), "utf8"), "retain evidence\n");
  assert.equal(f.git("status", "--porcelain"), "");
  f.preserved();
});

test("legacy worktree audit retains dirty identity and pin diagnostics without writes", (t) => {
  const f = fixture(t);
  const current = f.git("rev-parse", "HEAD");
  f.json(join(f.root, "package.json"), { private: true });
  const pkg = f.manifest();
  pkg.name = "@legacy/tasks";
  pkg.devDependencies[sdk] = "0.6.15";
  f.json(join(f.root, names[0], "package.json"), pkg);
  f.commit();
  const legacyHead = f.git("rev-parse", "HEAD");
  f.git("checkout", current, "--", "package.json", `${names[0]}/package.json`);
  f.commit();
  const other = join(f.home, "legacy checkout");
  f.git("worktree", "add", "--quiet", "--detach", other, legacyHead);
  writeFileSync(join(other, "tasks.json"), "legacy thread work\n");
  writeFileSync(join(other, "untracked.txt"), "legacy untracked work\n");
  const before = f.git("-C", other, "diff", "--binary");
  const status = f.git("-C", other, "status", "--porcelain=v1", "--untracked-files=all");
  const audit = f.run(["audit", "--all-worktrees"]);
  assert.equal(audit.status, 1);
  assert.equal(audit.report.error, null);
  const checkout = audit.report.checkouts.find(({ path }) => path === other);
  assert.equal(checkout.error, undefined);
  assert.equal(checkout.head, legacyHead);
  assert.equal(checkout.dirty, true);
  assert.equal(checkout.status.trim(), status);
  assert.deepEqual(
    checkout.packages.map(({ directory, name }) => [directory, name]),
    [
      [names[0], "@legacy/tasks"],
      [names[1], names[1]],
    ],
  );
  const observed = checkout.packages[0];
  assert.equal(observed.committed.sdk, "0.6.15");
  assert.equal(observed.declarations.sdk, "0.6.15");
  assert.equal(observed.status, "needs-attention");
  assert.equal(observed.official.exitCode, 12);
  assert.equal(observed.official.stdout, "pin=0.6.15 host=0.6.104\n");
  assert.equal(
    observed.official.stderr,
    "Official SDK and shim declarations need synchronization\n",
  );
  assert.equal(f.git("-C", other, "diff", "--binary"), before);
  assert.equal(f.git("-C", other, "status", "--porcelain=v1", "--untracked-files=all"), status);
  assert.equal(readFileSync(join(other, "untracked.txt"), "utf8"), "legacy untracked work\n");
  assert.equal(readFileSync(join(other, "bun.lock"), "utf8"), "original root lock\n");
  assert.equal(f.git("status", "--porcelain"), "");
  assert.equal(
    f
      .trace()
      .every(
        ({ command, args }) =>
          command === "bb" && (args[0] === "--version" || args[3] === "--check"),
      ),
    true,
  );
  f.preserved();
});

test("legacy root refuses preview and apply before synchronization or dependency writes", (t) => {
  const f = fixture(t);
  f.json(join(f.root, "package.json"), { private: true });
  f.commit();
  for (const args of [["align", "--package", names[0]], f.apply()]) {
    const result = f.run(args);
    assert.equal(result.status, 1);
    assert.match(result.report.error, /Missing workspaces/);
    assert.deepEqual(result.report.projections, []);
    assert.deepEqual(result.report.stages, []);
  }
  assert.deepEqual(
    f.trace().map(({ command, args }) => [command, args]),
    [
      ["bb", ["--version"]],
      ["bb", ["--version"]],
    ],
  );
  assert.equal(f.git("status", "--porcelain"), "");
  assert.equal(f.read("bun.lock"), "original root lock\n");
  assert.equal(existsSync(join(f.home, "review evidence")), false);
  f.preserved();
});

for (const server of [undefined, 42]) {
  test(`official boundary rejects bb.server=${server} without checkout writes`, (t) => {
    const f = fixture(t);
    const pkg = f.manifest();
    if (server === undefined) delete pkg.bb.server;
    else pkg.bb.server = server;
    f.json(join(f.root, names[0], "package.json"), pkg);
    f.commit();
    const result = f.run(f.apply());
    assert.equal(result.status, 1);
    assert.match(result.report.error, /Official projection failed/);
    assert.equal(result.report.checkouts[0].packages[0].official.exitCode, 32);
    assert.equal(result.report.projections[0].official.exitCode, 32);
    assert.equal(
      result.report.projections[0].official.stderr,
      "Plugin manifest requires a string bb.server\n",
    );
    assert.equal(f.git("status", "--porcelain"), "");
    assert.equal(f.read("bun.lock"), "original root lock\n");
    assert.equal(
      f.trace().some(({ command }) => command === "bun"),
      false,
    );
    assert.equal(
      f
        .trace()
        .some(({ args }) => args[1] === "types" && args.length === 3 && args[2].startsWith(f.root)),
      false,
    );
    f.preserved();
  });
}

test("audit reports malformed declared workspaces instead of assuming the legacy layout", (t) => {
  const f = fixture(t);
  for (const workspaces of [null, {}, "bb-plugin-*", [null], [""]]) {
    f.json(join(f.root, "package.json"), { private: true, workspaces });
    const before = f.git("diff", "--binary");
    const result = f.run(["audit"]);
    assert.equal(result.status, 1);
    assert.equal(result.report.checkouts[0].error, `Invalid workspaces in ${f.root}`);
    assert.deepEqual(result.report.checkouts[0].packages, []);
    assert.equal(f.git("diff", "--binary"), before);
  }
  assert.deepEqual(
    f.trace().map(({ command, args }) => [command, args]),
    Array(5).fill(["bb", ["--version"]]),
  );
  assert.equal(f.read("bun.lock"), "original root lock\n");
  f.preserved();
});
