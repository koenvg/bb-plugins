import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { afterEach, beforeEach, expect, it } from "vitest";

const pluginRoot = fileURLToPath(new URL("../", import.meta.url));
const script = join(pluginRoot, "scripts/check-installed-globs.mjs");
const piRequire = createRequire(
  join(pluginRoot, "node_modules/@earendil-works/pi-coding-agent/package.json"),
);
const minimatchSource = dirname(piRequire.resolve("minimatch/package.json"));
const braceSource = dirname(
  createRequire(join(minimatchSource, "package.json")).resolve("brace-expansion/package.json"),
);
const balancedSource = dirname(
  createRequire(join(braceSource, "package.json")).resolve("balanced-match/package.json"),
);
let fixture: string;
let braceDir: string;

function json(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
}

function run(cwd: string) {
  return spawnSync(process.execPath, ["--experimental-import-meta-resolve", script], {
    cwd,
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 64 * 1024,
  });
}

beforeEach(() => {
  fixture = realpathSync(mkdtempSync(join(tmpdir(), "quota-installed-globs-")));
  json(join(fixture, "package.json"), { name: "synthetic-quota", type: "module" });
  const piDir = join(fixture, "node_modules/@earendil-works/pi-coding-agent");
  json(join(piDir, "package.json"), {
    name: "@earendil-works/pi-coding-agent",
    type: "module",
    exports: { ".": { import: "./index.js" } },
  });
  writeFileSync(join(piDir, "index.js"), 'throw new Error("The guard must not load Pi");');

  // Small offline fixture. Reuse real glob code, but synthesize package versions
  // and nested placement. A separate clean-install probe verifies actual 5.0.9.
  const minimatchDir = join(piDir, "node_modules/minimatch");
  cpSync(minimatchSource, minimatchDir, { recursive: true });
  braceDir = join(minimatchDir, "node_modules/brace-expansion");
  cpSync(braceSource, braceDir, { recursive: true });
  cpSync(balancedSource, join(braceDir, "node_modules/balanced-match"), { recursive: true });
  // Fixed decoys at both Quota and Pi roots must not mask minimatch's nested copy.
  for (const parent of [fixture, piDir]) {
    const decoy = join(parent, "node_modules/brace-expansion");
    json(join(decoy, "package.json"), {
      name: "brace-expansion",
      version: "5.0.12",
      type: "module",
      exports: { ".": "./index.js", "./package.json": "./package.json" },
    });
    writeFileSync(join(decoy, "index.js"), 'throw new Error("Wrong brace-expansion instance");');
  }
  json(join(fixture, "package-lock.json"), {
    lockfileVersion: 3,
    packages: {
      "node_modules/brace-expansion": { version: "5.0.12" },
      "node_modules/@earendil-works/pi-coding-agent/node_modules/minimatch/node_modules/brace-expansion":
        {
          version: "5.0.12",
        },
    },
  });
});

afterEach(() => {
  rmSync(fixture, { recursive: true, force: true });
});

it("passes the accepted installed production graph and ordinary glob behavior", () => {
  const result = run(pluginRoot);
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("Installed glob guard passed");
});

it("follows Pi's nested minimatch copy rather than either fixed root decoy", () => {
  const result = run(fixture);
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain(pathToFileURL(braceDir).href);
});

it.each(["5.0.9", "5.0.10", "5.0.11", "5.0.12-rc.1", "unknown"])(
  "rejects installed %s even when the parent lockfile claims 5.0.12",
  (version) => {
    const path = join(braceDir, "package.json");
    json(path, { ...JSON.parse(readFileSync(path, "utf8")), version });
    const result = run(fixture);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`installed ${version} at ${pathToFileURL(path).href}`);
    expect(result.stderr).toContain("requires stable >=5.0.12");
    expect(result.stderr).toContain("Parent lockfile edits or audit output are not proof");
    expect(result.stdout).toBe("");
    expect(readFileSync(join(fixture, "package-lock.json"), "utf8")).toContain("5.0.12");
  },
);

it("fails when the installed Pi package is missing, with a retry command", () => {
  rmSync(join(fixture, "node_modules/@earendil-works/pi-coding-agent"), {
    recursive: true,
  });
  const result = run(fixture);
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("@earendil-works/pi-coding-agent");
  expect(result.stderr).toContain("npm ci");
  expect(result.stderr).toContain("npm run check:installed-globs");
});

it("fails when a fixed-version package breaks ordinary brace expansion", () => {
  writeFileSync(join(braceDir, "dist/esm/index.js"), "export const expand = () => [];");
  const result = run(fixture);
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Installed glob guard failed");
  expect(result.stdout).toBe("");
});
