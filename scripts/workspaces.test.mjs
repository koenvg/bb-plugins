import assert from "node:assert/strict";
import { existsSync, globSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const workspaces = globSync(
  manifest.workspaces.map((path) => `${path}/package.json`),
  { cwd: root },
);

test("one root lock owns all named workspaces and their dependency overrides", () => {
  assert.deepEqual(manifest.workspaces, ["bb-plugin-*", "packages/*", "review-ui"]);
  assert.ok(existsSync(join(root, "bun.lock")));
  assert.match(
    readFileSync(join(root, "bunfig.toml"), "utf8"),
    /\[install\]\s+linker = "isolated"/,
  );
  const names = new Set();
  for (const path of workspaces) {
    const pkg = JSON.parse(readFileSync(join(root, path), "utf8"));
    assert.ok(pkg.name, path);
    assert.ok(!names.has(pkg.name), `Duplicate workspace name ${pkg.name}`);
    names.add(pkg.name);
    assert.equal(existsSync(join(root, dirname(path), "bun.lock")), false, path);
    assert.equal(pkg.overrides, undefined, path);
    for (const group of ["dependencies", "devDependencies"]) {
      for (const dependency of Object.keys(pkg[group] ?? {})) {
        assert.ok(
          existsSync(join(root, dirname(path), "node_modules", dependency)),
          `${pkg.name} cannot resolve its declared ${dependency}`,
        );
      }
    }
  }
});

test("document and review consumers resolve the local source workspaces", () => {
  for (const [source, consumers] of [
    ["packages/markdown-document", ["bb-plugin-markdown-reader", "bb-plugin-tasks-plus"]],
    ["review-ui", ["bb-plugin-changes", "bb-plugin-github-insight"]],
  ]) {
    const shared = JSON.parse(readFileSync(join(root, source, "package.json"), "utf8"));
    for (const consumer of consumers) {
      const pkg = JSON.parse(readFileSync(join(root, consumer, "package.json"), "utf8"));
      assert.equal(pkg.dependencies[shared.name], "workspace:*");
      assert.equal(
        realpathSync(join(root, consumer, "node_modules", shared.name)),
        realpathSync(join(root, source)),
      );
    }
  }
});

test("both pinned BB toolchains retain the accepted npm override", () => {
  assert.equal(manifest.overrides.npm, "11.21.0");
  for (const plugin of ["bb-plugin-mcp", "bb-plugin-pi-subagents-provider"]) {
    const require = createRequire(join(root, plugin, "package.json"));
    const bbRequire = createRequire(require.resolve("bb-app"));
    assert.equal(bbRequire("npm/package.json").version, "11.21.0", plugin);
  }
});

test("Tasks keeps its explicit TypeScript 7 compiler alongside other workspace compilers", () => {
  const compiler = JSON.parse(
    readFileSync(join(root, "bb-plugin-tasks-plus/node_modules/typescript-7/package.json"), "utf8"),
  );
  assert.equal(compiler.name, "typescript");
  assert.equal(compiler.version, "7.0.2");
  const providerCompiler = JSON.parse(
    readFileSync(
      join(root, "bb-plugin-pi-subagents-provider/node_modules/typescript/package.json"),
      "utf8",
    ),
  );
  assert.equal(providerCompiler.version, "5.9.3");
});
