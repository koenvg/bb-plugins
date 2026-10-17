import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const directories: string[] = [];
const privateMarker = "private-generator-fixture-marker";
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "bb-speed-generator-"));
  directories.push(directory);
  for (const path of ["scripts", "vendor", "src/bridge", "node_modules/@koenvg"]) {
    mkdirSync(join(directory, path), { recursive: true });
  }
  const script = "scripts/update-codex-speed.mjs";
  const archive = join(directory, "vendor/koenvg-pi-openai-codex-speed-0.1.0.tgz");
  const destination = join(directory, "src/bridge/codex-speed-source.ts");
  cpSync(join(root, script), join(directory, script));
  cpSync(join(root, "vendor/koenvg-pi-openai-codex-speed-0.1.0.tgz"), archive);
  const installed = join(directory, "node_modules/@koenvg/pi-openai-codex-speed");
  cpSync(join(root, "node_modules/@koenvg/pi-openai-codex-speed"), installed, {
    recursive: true,
    dereference: true,
  });
  symlinkSync(join(root, "node_modules/esbuild"), join(directory, "node_modules/esbuild"));
  const expected = readFileSync(join(root, "src/bridge/codex-speed-source.ts"));
  writeFileSync(destination, expected);
  return {
    directory,
    archive,
    installed,
    destination,
    expected,
    run: (...args: string[]) =>
      spawnSync(process.execPath, [join(directory, script), ...args], {
        cwd: directory,
        encoding: "utf8",
        timeout: 15_000,
      }),
  };
}

it("checks pristine inputs and repeatedly reproduces the committed bundle byte-for-byte", () => {
  const harness = fixture();
  for (const args of [["--check"], [], [], ["--check"]]) {
    const result = harness.run(...args);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(readFileSync(harness.destination).equals(harness.expected)).toBe(true);
  }
});

it("creates a missing destination deterministically without ambient tsconfig resolution", () => {
  const harness = fixture();
  rmSync(harness.destination);
  writeFileSync(join(harness.directory, "tsconfig.json"), "not a valid tsconfig");
  const result = harness.run();
  expect(result.status, result.stderr).toBe(0);
  expect(readFileSync(harness.destination).equals(harness.expected)).toBe(true);
  const check = harness.run("--check");
  expect(check.status, check.stderr).toBe(0);
});

const mutations: { label: string; path: string; change: (source: string) => string }[] = [
  {
    label: "transitive controller behavior",
    path: "dist/controller.js",
    change: (source) => source.replace("return value;", 'return "default";'),
  },
  ...["dist/index.js", "dist/capabilities.js", "dist/pi.js", "dist/extension.js"].map((path) => ({
    label: path,
    path,
    change: (source: string) => `${source}\n// ${privateMarker}\n`,
  })),
  {
    label: "resolution exports",
    path: "package.json",
    change: (source) =>
      source.replace('"import": "./dist/index.js"', '"import": "./dist/controller.js"'),
  },
  {
    label: "resolution module type",
    path: "package.json",
    change: (source) => source.replace('"type": "module"', '"type": "commonjs"'),
  },
  {
    label: "an escaping import",
    path: "dist/index.js",
    change: (source) => `${source}\nimport "../../outside.js";\n`,
  },
  {
    label: "an additional source import",
    path: "dist/index.js",
    change: (source) => `${source}\nimport "./additional.js";\n`,
  },
];

for (const check of [false, true]) {
  for (const present of [false, true]) {
    const mode = `${check ? "check" : "generation"}, destination ${present ? "present" : "absent"}`;
    it.each(mutations)(`rejects $label before any output write (${mode})`, ({ path, change }) => {
      const harness = fixture();
      const input = join(harness.installed, path);
      const original = readFileSync(input, "utf8");
      const altered = change(original);
      expect(altered === original).toBe(false);
      writeFileSync(input, altered);
      writeFileSync(
        join(harness.installed, "dist/additional.js"),
        `throw new Error("${privateMarker}");`,
      );
      writeFileSync(
        join(harness.directory, "node_modules/outside.js"),
        `throw new Error("${privateMarker}");`,
      );
      const previous = Buffer.from("existing output must survive\n");
      if (present) writeFileSync(harness.destination, previous);
      else rmSync(harness.destination);

      const result = harness.run(...(check ? ["--check"] : []));
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`Pinned Codex speed installed input mismatch: ${path}`);
      expect(result.stderr).not.toContain(privateMarker);
      expect(result.stdout).toBe("");
      expect(existsSync(harness.destination)).toBe(present);
      if (present) expect(readFileSync(harness.destination).equals(previous)).toBe(true);
    });

    it(`rejects archive hash drift before any output write (${mode})`, () => {
      const harness = fixture();
      writeFileSync(
        harness.archive,
        Buffer.concat([readFileSync(harness.archive), Buffer.from(privateMarker)]),
      );
      if (!present) rmSync(harness.destination);
      const result = harness.run(...(check ? ["--check"] : []));
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Pinned Codex speed artifact hash mismatch.");
      expect(result.stderr).not.toContain(privateMarker);
      expect(result.stdout).toBe("");
      expect(existsSync(harness.destination)).toBe(present);
      if (present) expect(readFileSync(harness.destination).equals(harness.expected)).toBe(true);
    });

    it(`rejects a missing installed source before any output write (${mode})`, () => {
      const harness = fixture();
      rmSync(join(harness.installed, "dist/pi.js"));
      if (!present) rmSync(harness.destination);
      const result = harness.run(...(check ? ["--check"] : []));
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("ENOENT");
      expect(result.stdout).toBe("");
      expect(existsSync(harness.destination)).toBe(present);
      if (present) expect(readFileSync(harness.destination).equals(harness.expected)).toBe(true);
    });
  }
}
