import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
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
const requiredVersion = readFileSync(join(repository, ".bun-version"), "utf8").trim();
const installed = [".", "packages/markdown-document", "bb-plugin-alpha", "bb-plugin-zeta"];
const successfulCalls = [
  ".|install --frozen-lockfile|unset",
  "packages/markdown-document|run build|unset",
];

function runSetup(t, options = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "bb-environment-setup-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, "bin");
  mkdirSync(bin);
  for (const name of [".bb-env-setup.sh", ".bun-version", "package.json", "bun.lock"]) {
    copyFileSync(join(repository, name), join(root, name));
  }
  for (const directory of installed.slice(1)) {
    mkdirSync(join(root, directory), { recursive: true });
    writeFileSync(join(root, directory, "package.json"), "{}");
  }
  mkdirSync(join(root, "bb-plugin-without-manifest"));
  if (options.missingLock) rmSync(join(root, "bun.lock"));
  const bunLog = join(root, "bun-arguments");
  const trace = join(root, "install-trace");
  if (!options.missingBun) {
    writeFileSync(
      join(bin, "bun"),
      `#!${bash}
printf '%s\\n' "$*" >> "$SETUP_TEST_BUN_LOG"
case "$1" in
  --version) echo "$SETUP_TEST_BUN_VERSION"; exit "$SETUP_TEST_VERSION_EXIT" ;;
  install|run)
    directory="\${PWD#"$SETUP_TEST_ROOT"/}"
    if [ "$PWD" = "$SETUP_TEST_ROOT" ]; then directory=.; fi
    printf '%s|%s|%s\\n' "$directory" "$*" "\${NODE_ENV-unset}" >> "$SETUP_TEST_TRACE"
    if [ "$directory" = "$SETUP_TEST_FAIL_DIRECTORY" ] && [ "$*" = "$SETUP_TEST_FAIL_COMMAND" ]; then
      exit 42
    fi
    exit 0 ;;
  *) exit 99 ;;
esac
`,
      { mode: 0o755 },
    );
  }
  const invocation = {
    cwd: root,
    encoding: "utf8",
    timeout: 10_000,
    env: {
      ...process.env,
      PATH: bin,
      NODE_ENV: "production",
      SETUP_TEST_ROOT: root,
      SETUP_TEST_BUN_VERSION: options.bunVersion ?? requiredVersion,
      SETUP_TEST_BUN_LOG: bunLog,
      SETUP_TEST_TRACE: trace,
      SETUP_TEST_VERSION_EXIT: String(options.versionExit ?? 0),
      SETUP_TEST_FAIL_DIRECTORY: options.failDirectory ?? "",
      SETUP_TEST_FAIL_COMMAND: options.failCommand ?? "install --frozen-lockfile",
    },
  };
  const result = spawnSync(bash, [join(root, ".bb-env-setup.sh")], invocation);
  if (result.error) throw result.error;
  if (options.repeat && result.status === 0) {
    const repeated = spawnSync(bash, [join(root, ".bb-env-setup.sh")], invocation);
    assert.equal(repeated.status, 0, repeated.stderr);
  }
  function readOptional(path) {
    try {
      return readFileSync(path, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return "";
      throw error;
    }
  }
  return {
    ...result,
    root,
    bunLog: readOptional(bunLog),
    trace: readOptional(trace).trim().split("\n").filter(Boolean),
  };
}

test("pinned Bun installs all workspace development dependencies once before building Markdown", (t) => {
  const result = runSetup(t);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.trace, successfulCalls);
  for (const name of [".bun-version", "package.json", "bun.lock"]) {
    assert.equal(
      readFileSync(join(result.root, name), "utf8"),
      readFileSync(join(repository, name), "utf8"),
    );
  }
  for (const directory of installed.slice(1)) {
    assert.equal(readFileSync(join(result.root, directory, "package.json"), "utf8"), "{}");
    assert.equal(existsSync(join(result.root, directory, "bun.lock")), false);
  }
  const manifest = JSON.parse(readFileSync(join(repository, "package.json"), "utf8"));
  assert.equal(manifest.packageManager, `bun@${requiredVersion}`);
  assert.equal(manifest.engines.bun, requiredVersion);
});

test("setup can be repeated without changing manifests or lockfiles", (t) => {
  const result = runSetup(t, { repeat: true });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.trace, [...successfulCalls, ...successfulCalls]);
});

for (const bunVersion of ["1.3.14", "1.4.2", "1.4.4", "1.4.3-canary.1"]) {
  test(`unpinned Bun ${bunVersion} fails before installation`, (t) => {
    const result = runSetup(t, { bunVersion });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(`Setup requires Bun ${requiredVersion}`));
    assert.ok(result.stderr.includes(bunVersion));
    assert.equal(result.bunLog, "--version\n");
    assert.deepEqual(result.trace, []);
  });
}

test("missing Bun fails with a useful error", (t) => {
  const result = runSetup(t, { missingBun: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Setup requires Bun/);
  assert.equal(result.bunLog, "");
});

test("a broken Bun executable fails before installation", (t) => {
  const result = runSetup(t, { versionExit: 2 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Bun could not run/);
  assert.equal(result.bunLog, "--version\n");
});

test("missing root lockfile fails before installation", (t) => {
  const result = runSetup(t, { missingLock: true });
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes("bun.lock"));
  assert.deepEqual(result.trace, []);
});

for (const [index, call] of successfulCalls.entries()) {
  test(`failure at ${call} stops setup without retry or later work`, (t) => {
    const [failDirectory, failCommand] = call.split("|");
    const result = runSetup(t, { failDirectory, failCommand });
    assert.equal(result.status, 42, result.stderr);
    assert.deepEqual(result.trace, successfulCalls.slice(0, index + 1));
  });
}
