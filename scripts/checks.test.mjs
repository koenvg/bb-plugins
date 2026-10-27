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
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const rootScripts = [
  "test:setup",
  "test:workspaces",
  "test:browser-lifecycle",
  "test:review",
  "lint",
  "format:check",
];
const rootIds = rootScripts.map((script) => `root:${script}`);
const packages = ["bb-plugin-alpha", "bb-plugin-zeta", "bb-plugin-unselected"];
const entryScripts = {
  check: "bun --no-install scripts/checks.mjs root",
  "check:review": "bun --no-install scripts/checks.mjs review",
  "test:review": "bun test scripts/checks.test.mjs",
};

function fixture(t, exits = {}, missing = []) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "bb checks ")));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const root = join(home, "checkout with spaces");
  execFileSync("git", ["clone", "--quiet", "--shared", "--no-checkout", repository, root]);
  mkdirSync(join(root, "scripts"));
  const runner = join(repository, "scripts/checks.mjs");
  if (existsSync(runner)) copyFileSync(runner, join(root, "scripts/checks.mjs"));
  writeFileSync(
    join(root, "leaf.mjs"),
    `import { appendFileSync, mkdirSync } from "node:fs";
const id = process.argv[2];
appendFileSync(process.env.CHECK_TRACE, id + "\\n");
console.log("stdout " + id);
console.error("stderr " + id);
if (process.env.BREAK_EVIDENCE === id) mkdirSync(process.env.CHECK_EVIDENCE + "/summary.json");
process.exit(JSON.parse(process.env.CHECK_EXITS)[id] ?? 0);
`,
  );
  for (const name of ["root", ...packages]) {
    const cwd = name === "root" ? root : join(root, name);
    mkdirSync(cwd, { recursive: true });
    const scripts = {};
    for (const script of name === "root" ? rootScripts : ["test", "typecheck"]) {
      if (!missing.includes(`${name}:${script}`)) {
        scripts[script] = `bun ${name === "root" ? "" : "../"}leaf.mjs ${name}:${script}`;
      }
    }
    for (const script of ["setup", "install", "check:sdk", "build", "activate", "test:browser"]) {
      scripts[script] = `bun ${name === "root" ? "" : "../"}leaf.mjs FORBIDDEN:${script}`;
    }
    if (name === "root")
      Object.assign(scripts, entryScripts, { "test:review": scripts["test:review"] });
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ private: true, scripts }));
  }
  const evidence = join(home, "new evidence");
  const traceFile = join(home, "trace");
  return {
    root,
    evidence,
    run(args = [], extraEnv = {}) {
      return spawnSync(process.execPath, ["--no-install", "run", ...args], {
        cwd: root,
        encoding: "utf8",
        timeout: 30_000,
        env: {
          ...process.env,
          CHECK_TRACE: traceFile,
          CHECK_EXITS: JSON.stringify(exits),
          CHECK_EVIDENCE: evidence,
          ...extraEnv,
        },
      });
    },
    trace() {
      return existsSync(traceFile) ? readFileSync(traceFile, "utf8").trim().split("\n") : [];
    },
    json(name) {
      return JSON.parse(readFileSync(join(evidence, name), "utf8"));
    },
  };
}

function review(f, selected = [], extraEnv = {}) {
  return f.run(
    ["check:review", "--evidence", f.evidence, ...selected.flatMap((name) => ["--package", name])],
    extraEnv,
  );
}

function success(result) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
}

test("root manifest exposes the public check commands without changing leaf scripts", () => {
  const manifest = JSON.parse(readFileSync(join(repository, "package.json"), "utf8"));
  for (const [name, script] of Object.entries(entryScripts)) {
    assert.equal(manifest.scripts[name], script);
  }
  assert.equal(manifest.scripts.lint, "oxlint");
  assert.equal(manifest.scripts["format:check"], "oxfmt --check");
});

test("root and root-only review run the same checks, never plugin suites", (t) => {
  const root = fixture(t);
  success(root.run(["check"]));
  assert.deepEqual(root.trace(), rootIds);
  const f = fixture(t);
  const result = review(f);
  success(result);
  assert.deepEqual(f.trace(), rootIds);
  const plan = f.json("plan.json");
  assert.deepEqual(plan.packages, []);
  assert.match(plan.head, /^[0-9a-f]{40}$/);
  assert.equal(typeof plan.status, "string");
  assert.deepEqual(
    plan.checks.map((check) => check.id),
    rootIds,
  );
  assert.equal(statSync(f.evidence).mode & 0o777, 0o700);
  const summary = f.json("summary.json");
  assert.equal(summary.passed, true);
  assert.deepEqual(
    summary.results.map((result) => result.exitCode),
    [0, 0, 0, 0, 0, 0],
  );
  assert.ok(result.stdout.includes(f.evidence));
});

test("only explicitly selected multiple packages run once after all root checks", (t) => {
  const f = fixture(t);
  success(review(f, packages.slice(0, 2)));
  assert.deepEqual(f.trace(), [
    ...rootIds,
    "bb-plugin-alpha:test",
    "bb-plugin-alpha:typecheck",
    "bb-plugin-zeta:test",
    "bb-plugin-zeta:typecheck",
  ]);
  const plan = f.json("plan.json");
  assert.deepEqual(plan.packages, packages.slice(0, 2));
  for (const check of plan.checks) {
    const log = readFileSync(join(f.evidence, check.log), "utf8");
    assert.ok(log.includes(`stdout ${check.id}`));
    assert.ok(log.includes(`stderr ${check.id}`));
    assert.ok(log.includes(check.cwd));
    assert.ok(log.includes(JSON.stringify(["bun", "--no-install", "run", check.script])));
  }
  const lines = readFileSync(join(f.evidence, "results.jsonl"), "utf8").trim().split("\n");
  assert.deepEqual(
    lines.map((line) => JSON.parse(line)),
    f.json("summary.json").results,
  );
});

for (const [index, id] of rootIds.entries()) {
  test(`${id} failure preserves its exit and still runs all later checks`, (t) => {
    const f = fixture(t, { [id]: 21 + index });
    const result = review(f, [packages[0]]);
    assert.equal(result.status, 1, result.stderr);
    assert.deepEqual(f.trace(), [...rootIds, "bb-plugin-alpha:test", "bb-plugin-alpha:typecheck"]);
    const summary = f.json("summary.json");
    assert.equal(summary.passed, false);
    assert.equal(summary.results[index].exitCode, 21 + index);
    const root = fixture(t, { [id]: 21 + index });
    assert.equal(root.run(["check"]).status, 1);
    assert.deepEqual(root.trace(), rootIds);
  });
}

test("multiple exact failures preserve test, typecheck and later package outcomes", (t) => {
  const f = fixture(t, {
    "root:lint": 31,
    "bb-plugin-alpha:test": 42,
    "bb-plugin-alpha:typecheck": 43,
    "bb-plugin-zeta:typecheck": 57,
  });
  assert.equal(review(f, packages.slice(0, 2)).status, 1);
  assert.deepEqual(f.trace(), [
    ...rootIds,
    "bb-plugin-alpha:test",
    "bb-plugin-alpha:typecheck",
    "bb-plugin-zeta:test",
    "bb-plugin-zeta:typecheck",
  ]);
  assert.deepEqual(
    f.json("summary.json").results.map(({ exitCode, signal, error }) => [exitCode, signal, error]),
    [0, 0, 0, 0, 31, 0, 42, 43, 0, 57].map((code) => [code, null, null]),
  );
});

test("missing scripts fail without fabricating an exit or skipping later checks", (t) => {
  const f = fixture(t, {}, ["root:lint", "bb-plugin-alpha:test"]);
  assert.equal(review(f, [packages[0]]).status, 1);
  const summary = f.json("summary.json");
  for (const index of [4, 6]) {
    assert.equal(summary.results[index].exitCode, null);
    assert.match(summary.results[index].error, /Missing script/);
  }
  assert.deepEqual(f.trace(), [
    ...rootIds.filter((id) => id !== "root:lint"),
    "bb-plugin-alpha:typecheck",
  ]);
});

test("invalid arguments and an existing or in-checkout evidence path fail before checks", (t) => {
  const f = fixture(t);
  const invalid = [
    [],
    ["--unknown"],
    ["--evidence"],
    ["--evidence", f.evidence, "--package"],
    ["--evidence", f.evidence, "--package", "bb-plugin-missing"],
    ["--evidence", f.evidence, "--package", "../bb-plugin-alpha"],
    ["--evidence", f.evidence, "--package", "bb-plugin-alpha/../bb-plugin-zeta"],
    ["--evidence", f.evidence, "--package", packages[0], "--package", packages[0]],
    ["--evidence", f.evidence, "--evidence", f.evidence],
    ["--evidence", join(f.root, "evidence")],
    ["--root", f.root, "--evidence", f.evidence],
  ];
  for (const args of invalid) {
    const result = f.run(["check:review", ...args]);
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.deepEqual(f.trace(), []);
    assert.equal(existsSync(f.evidence), false);
  }
  mkdirSync(f.evidence);
  writeFileSync(join(f.evidence, "keep"), "original");
  assert.equal(review(f).status, 1);
  assert.equal(readFileSync(join(f.evidence, "keep"), "utf8"), "original");
  assert.deepEqual(f.trace(), []);
});

test("an evidence write failure cannot pass after checks finish", (t) => {
  const f = fixture(t);
  const result = review(f, [], { BREAK_EVIDENCE: "root:test:setup" });
  assert.equal(result.status, 1);
  assert.deepEqual(f.trace(), rootIds);
  assert.match(result.stderr, /summary\.json/);
  assert.equal(statSync(join(f.evidence, "summary.json")).isDirectory(), true);
});
