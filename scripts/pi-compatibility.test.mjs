import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const workflow = Bun.YAML.parse(
  readFileSync(new URL("../.github/workflows/pi-compatibility.yml", import.meta.url), "utf8"),
);
const steps = workflow.jobs.compatibility.steps;
const candidate = steps.find((step) => step.id === "candidate");
const advisory = steps.find((step) => step.id === "advisory");
const checks = steps.find((step) => step.id === "checks");
const summary = steps.find((step) => step.name === "Save candidate diff and check summary");
const candidateTrace = [
  "bun add --dev --exact bb-app@latest",
  "bun add --dev --exact @get-bb/plugin-sdk@0.6.79",
  "bun add --exact @get-bb/plugin-sdk-runtime@npm:@get-bb/plugin-sdk@0.6.79",
];
const checkTrace = [
  "bb --version",
  "bb plugin types . --check",
  "bun run typecheck",
  "bun run test",
  "bb plugin build .",
];
const passingExits =
  "admission\t0\ncli-version\t0\nofficial-types\t0\ntypecheck\t0\ntests\t0\nbuild\t0\n";

function fixture(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), "pi-compatibility-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const provider = join(root, "bb-plugin-pi-subagents-provider");
  const bin = join(root, "bin");
  const report = join(root, "report");
  for (const directory of [provider, bin, report, join(provider, "node_modules/.bin")]) {
    mkdirSync(directory, { recursive: true });
  }
  const manifest = {
    engines: { bb: ">=0.47.1 <0.48.0", bbPluginSdk: ">=0.6.79 <0.7.0" },
    devDependencies: { "bb-app": "0.47.1", "@get-bb/plugin-sdk": "0.6.70" },
    dependencies: { "@get-bb/plugin-sdk-runtime": "npm:@get-bb/plugin-sdk@0.6.70" },
  };
  writeFileSync(join(provider, "package.json"), JSON.stringify(manifest));
  const metadata = options.metadata ?? [
    { builtWith: { pluginSdkVersion: "0.6.79" } },
    { builtWith: { pluginSdkVersion: "0.6.79" } },
  ];
  for (const [index, meta] of metadata.entries()) {
    const dist = join(
      provider,
      "node_modules/bb-app/server/dist/builtin-plugins",
      `plugin-${index}`,
      "dist",
    );
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, "plugin.meta.json"), JSON.stringify(meta));
  }
  const boundary = `#!${process.execPath}
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { spawnSync } from "node:child_process";
const command = basename(process.argv[1]);
const args = process.argv.slice(2);
if (command === "bun" && args.join(" ") === "run -") {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  process.exit(result.status ?? 99);
}
appendFileSync(process.env.TRACE, command + " " + args.join(" ") + "\\n");
if (command === "git" && args[0] === "diff") { console.log("candidate diff"); process.exit(0); }
if (command === "npm" && args.join(" ") === "view @get-bb/plugin-sdk@latest version --json") {
  console.log(JSON.stringify(process.env.LATEST_SDK));
  console.error("registry diagnostic");
  process.exit(Number(process.env.LOOKUP_EXIT));
}
if (process.env.BB_CLI !== undefined || process.env.NODE_ENV !== undefined) process.exit(98);
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
function installed(name, version) {
  const path = "node_modules/" + name + "/package.json";
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ version }));
}
if (command === "bun" && args[0] === "add") {
  if (args.join(" ") === "add --dev --exact bb-app@latest") {
    manifest.devDependencies["bb-app"] = "0.47.1";
    installed("bb-app", "0.47.1");
  } else if (args[1] === "--dev" && args[2] === "--exact" && args[3].startsWith("@get-bb/plugin-sdk@")) {
    const version = args[3].split("@").at(-1);
    manifest.devDependencies["@get-bb/plugin-sdk"] = version;
    installed("@get-bb/plugin-sdk", version);
  } else if (args[1] === "--exact" && args[2].startsWith("@get-bb/plugin-sdk-runtime@npm:@get-bb/plugin-sdk@")) {
    const version = args[2].split("@").at(-1);
    manifest.dependencies["@get-bb/plugin-sdk-runtime"] = "npm:@get-bb/plugin-sdk@" + version;
    installed("@get-bb/plugin-sdk-runtime", version);
  } else { process.exit(99); }
  writeFileSync("package.json", JSON.stringify(manifest));
  console.log("installed candidate dependency");
} else if (command === "bb" && args.join(" ") === "plugin types . --check") {
  console.log("official SDK check");
  process.exit(Number(process.env.OFFICIAL_EXIT));
} else if (command === "bb" && ["--version", "plugin build ."].includes(args.join(" "))) {
  console.log("candidate CLI");
} else if (command === "bun" && ["run typecheck", "run test"].includes(args.join(" "))) {
  console.log("candidate package check");
  if (args[1] === "test") process.exit(Number(process.env.TEST_EXIT));
} else { process.exit(99); }
`;
  for (const command of ["bun", "npm", "git"]) {
    writeFileSync(join(bin, command), boundary, { mode: 0o755 });
  }
  writeFileSync(join(provider, "node_modules/.bin/bb"), boundary, { mode: 0o755 });
  const env = {
    ...process.env,
    PATH: `${bin}:/usr/bin:/bin`,
    BB_CLI: "/must-not-run-installed-bb",
    NODE_ENV: "production",
    TRACE: join(root, "trace"),
    COMPATIBILITY_REPORT: report,
    GITHUB_STEP_SUMMARY: join(root, "action-summary.md"),
    LATEST_SDK: options.latestSdk ?? "0.6.90",
    LOOKUP_EXIT: String(options.lookupExit ?? 0),
    OFFICIAL_EXIT: String(options.officialExit ?? 0),
    TEST_EXIT: String(options.testExit ?? 0),
    DEPENDENCIES_OUTCOME: "success",
    CANDIDATE_OUTCOME: "success",
    CHECKS_OUTCOME: "success",
    ADVISORY_OUTCOME: "success",
  };
  return {
    run(step) {
      assert.ok(step, "required workflow step exists");
      const result = spawnSync(
        "/bin/bash",
        ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", step.run],
        {
          cwd: step["working-directory"] === "." ? root : provider,
          env,
          encoding: "utf8",
          timeout: 10_000,
        },
      );
      if (result.error) throw result.error;
      return result;
    },
    read(name) {
      return readFileSync(join(report, name), "utf8");
    },
    trace() {
      return readFileSync(env.TRACE, "utf8").trim().split("\n");
    },
    manifest() {
      return JSON.parse(readFileSync(join(provider, "package.json"), "utf8"));
    },
    actionSummary() {
      return readFileSync(env.GITHUB_STEP_SUMMARY, "utf8");
    },
    env,
  };
}

for (const [name, options, expected] of [
  [
    "independently latest SDK mismatch is advisory",
    {},
    {
      latestPublishedSdk: "0.6.90",
      candidateSdk: "0.6.79",
      lookupExitCode: 0,
      status: "different",
    },
  ],
  [
    "matching latest SDK is reported",
    { latestSdk: "0.6.79" },
    {
      latestPublishedSdk: "0.6.79",
      candidateSdk: "0.6.79",
      lookupExitCode: 0,
      status: "matched",
    },
  ],
  [
    "failed metadata lookup is unavailable even with matching stdout",
    { latestSdk: "0.6.79", lookupExit: 42 },
    {
      latestPublishedSdk: null,
      candidateSdk: "0.6.79",
      lookupExitCode: 42,
      status: "unavailable",
    },
  ],
]) {
  test(name, (t) => {
    const f = fixture(t, options);
    assert.equal(f.run(candidate).status, 0);
    assert.deepEqual(f.trace(), candidateTrace);
    assert.deepEqual(f.manifest(), {
      engines: { bb: ">=0.47.1 <0.48.0", bbPluginSdk: ">=0.6.79 <0.7.0" },
      devDependencies: { "bb-app": "0.47.1", "@get-bb/plugin-sdk": "0.6.79" },
      dependencies: { "@get-bb/plugin-sdk-runtime": "npm:@get-bb/plugin-sdk@0.6.79" },
    });
    assert.equal(advisory?.["continue-on-error"], true);
    const lookup = f.run(advisory);
    assert.equal(lookup.status, options.lookupExit ?? 0, lookup.stderr);
    f.env.ADVISORY_OUTCOME = lookup.status === 0 ? "success" : "failure";
    assert.deepEqual(JSON.parse(f.read("sdk-advisory.json")), expected);
    assert.equal(f.read("sdk-lookup.stdout"), JSON.stringify(options.latestSdk ?? "0.6.90") + "\n");
    assert.equal(f.read("sdk-lookup.stderr"), "registry diagnostic\n");
    assert.equal(f.read("sdk-lookup-exit.txt"), `${options.lookupExit ?? 0}\n`);
    if (expected.status !== "matched") assert.match(lookup.stdout, /::warning::/);
    assert.equal(f.run(checks).status, 0);
    assert.equal(f.read("exits.tsv"), passingExits);
    assert.deepEqual(f.trace(), [
      ...candidateTrace,
      "npm view @get-bb/plugin-sdk@latest version --json",
      ...checkTrace,
    ]);
    assert.equal(f.run(summary).status, 0);
    assert.match(f.actionSummary(), new RegExp(`"status": "${expected.status}"`));
    assert.match(f.actionSummary(), /"candidateSdk": "0.6.79"/);
    assert.equal(f.actionSummary().includes(JSON.stringify(expected, null, 2)), true);
    if (expected.status === "unavailable") {
      assert.match(f.actionSummary(), /\| Independent latest SDK advisory \| failure \|/);
    }
    assert.equal(f.actionSummary(), f.read("summary.md"));
  });
}

for (const [name, metadata] of [
  ["missing", []],
  [
    "ambiguous",
    [{ builtWith: { pluginSdkVersion: "0.6.79" } }, { builtWith: { pluginSdkVersion: "0.6.90" } }],
  ],
  ["missing SDK field", [{ builtWith: {} }]],
  ["non-string SDK field", [{ builtWith: { pluginSdkVersion: 79 } }]],
]) {
  test(`${name} build metadata blocks SDK and runtime installation`, (t) => {
    const f = fixture(t, { metadata });
    assert.notEqual(candidate["continue-on-error"], true);
    const result = f.run(candidate);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Expected one builtWith\.pluginSdkVersion in bb-app/);
    assert.deepEqual(f.trace(), ["bun add --dev --exact bb-app@latest"]);
    assert.equal(f.manifest().devDependencies["@get-bb/plugin-sdk"], "0.6.70");
    assert.equal(
      f.manifest().dependencies["@get-bb/plugin-sdk-runtime"],
      "npm:@get-bb/plugin-sdk@0.6.70",
    );
  });
}

test("official check and full tests remain blocking and all checks aggregate", (t) => {
  const f = fixture(t, { officialExit: 44, testExit: 45 });
  assert.notEqual(checks["continue-on-error"], true);
  assert.equal(f.run(candidate).status, 0);
  assert.equal(f.run(checks).status, 1);
  assert.equal(
    f.read("exits.tsv"),
    "admission\t0\ncli-version\t0\nofficial-types\t44\ntypecheck\t0\ntests\t45\nbuild\t0\n",
  );
  assert.equal(f.read("official-types.log"), "official SDK check\n");
  assert.deepEqual(f.trace().slice(-5), checkTrace);
  f.env.CHECKS_OUTCOME = "failure";
  f.env.ADVISORY_OUTCOME = "skipped";
  assert.equal(summary.if, "${{ always() }}");
  assert.equal(f.run(summary).status, 0);
  assert.match(f.actionSummary(), /\| Candidate checks \| failure \|/);
  assert.match(f.actionSummary(), /\| official-types \| 44 \|/);
  assert.match(f.actionSummary(), /\| tests \| 45 \|/);
  assert.match(f.actionSummary(), /\| Independent latest SDK advisory \| skipped \|/);
  assert.match(f.actionSummary(), /Independent latest SDK metadata unavailable/);
});
