import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
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
const bash = execFileSync("bash", ["-c", "command -v bash"], { encoding: "utf8" }).trim();

function runSetup(t, options = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "bb-environment-setup-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, "bin");
  mkdirSync(bin);
  for (const name of [".bb-env-setup.sh", "package.json", "package-lock.json"]) {
    copyFileSync(join(repository, name), join(root, name));
  }
  const preload = join(root, "node-version.cjs");
  writeFileSync(
    preload,
    'Object.defineProperty(process.versions, "node", { value: process.env.SETUP_TEST_NODE_VERSION });\n',
  );
  if (!options.missingNode) {
    writeFileSync(
      join(bin, "node"),
      `#!${bash}\nexec "$SETUP_TEST_NODE" --require "$SETUP_TEST_PRELOAD" "$@"\n`,
      { mode: 0o755 },
    );
  }
  const npmLog = join(root, "npm-arguments");
  const npmCwd = join(root, "npm-cwd");
  if (!options.missingNpm) {
    writeFileSync(
      join(bin, "npm"),
      `#!${bash}
printf '%s\\n' "$*" >> "$SETUP_TEST_NPM_LOG"
case "$1" in
  --version) echo '11.12.1'; exit "$SETUP_TEST_NPM_VERSION_EXIT" ;;
  ci) pwd > "$SETUP_TEST_NPM_CWD"; exit "$SETUP_TEST_INSTALL_EXIT" ;;
  *) exit 99 ;;
esac
`,
      { mode: 0o755 },
    );
  }
  const result = spawnSync(bash, [join(root, ".bb-env-setup.sh")], {
    cwd: root,
    encoding: "utf8",
    timeout: 10_000,
    env: {
      ...process.env,
      PATH: bin,
      NODE_ENV: "production",
      SETUP_TEST_NODE: process.execPath,
      SETUP_TEST_PRELOAD: preload,
      SETUP_TEST_NODE_VERSION: options.nodeVersion ?? "24.15.0",
      SETUP_TEST_NPM_LOG: npmLog,
      SETUP_TEST_NPM_CWD: npmCwd,
      SETUP_TEST_NPM_VERSION_EXIT: String(options.npmVersionExit ?? 0),
      SETUP_TEST_INSTALL_EXIT: String(options.installExit ?? 0),
    },
  });
  if (result.error) throw result.error;
  function readOptional(path) {
    try {
      return readFileSync(path, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return "";
      throw error;
    }
  }
  return { ...result, root, npmLog: readOptional(npmLog), npmCwd: readOptional(npmCwd) };
}

test("supported Node installs only locked root tools, including dev tools in production mode", (t) => {
  const result = runSetup(t);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.npmLog,
    "--version\nci --include=dev --prefer-offline --no-audit --no-fund\n",
  );
  assert.equal(result.npmCwd.trim(), result.root);
  for (const name of ["package.json", "package-lock.json"]) {
    assert.equal(
      readFileSync(join(result.root, name), "utf8"),
      readFileSync(join(repository, name), "utf8"),
    );
  }
});

for (const nodeVersion of ["22.19.0", "24.14.0", "25.0.0", "24.15.0-rc.1"]) {
  test(`unsupported Node ${nodeVersion} fails before npm runs`, (t) => {
    const result = runSetup(t, { nodeVersion });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Setup requires Node >=24\.15\.0 <25/);
    assert.ok(result.stderr.includes(nodeVersion));
    assert.equal(result.npmLog, "");
  });
}

test("later Node 24 releases remain supported", (t) => {
  const result = runSetup(t, { nodeVersion: "24.16.0" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.npmLog, /ci --include=dev/);
});

test("missing Node fails with a useful error before npm runs", (t) => {
  const result = runSetup(t, { missingNode: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Setup requires Node/);
  assert.equal(result.npmLog, "");
});

test("missing npm fails with a useful error", (t) => {
  const result = runSetup(t, { missingNpm: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Setup requires npm/);
  assert.equal(result.npmLog, "");
});

test("a broken npm executable fails before installation", (t) => {
  const result = runSetup(t, { npmVersionExit: 2 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /npm could not run/);
  assert.equal(result.npmLog, "--version\n");
});

test("an install failure is returned without retry or fallback", (t) => {
  const result = runSetup(t, { installExit: 42 });
  assert.equal(result.status, 42);
  assert.equal(result.npmLog.split("\n").filter((line) => line.startsWith("ci ")).length, 1);
});
