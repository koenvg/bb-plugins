import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, it } from "vitest";

const root = fileURLToPath(new URL(".", import.meta.url));
const pluginManifest = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const require = createRequire(import.meta.url);
const bbCli = fileURLToPath(new URL("./bb.js", pathToFileURL(require.resolve("bb-app"))));
const testingUrl = pathToFileURL(require.resolve("@get-bb/plugin-sdk/testing")).href;
const hostTestingUrl = pathToFileURL(require.resolve("@get-bb/plugin-sdk/testing/host")).href;

it("builds and loads the public provider artifacts without development dependencies", () => {
  const directory = mkdtempSync(join(tmpdir(), "bb-pi-production-"));
  const packageDir = join(directory, "bb-plugin-pi-subagents-provider");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    BB_DATA_DIR: join(directory, "build-data"),
    HOME: directory,
  };
  delete env.BB_CLI;
  env.PI_CODING_AGENT_DIR = join(directory, "pi");
  try {
    cpSync(root, packageDir, {
      recursive: true,
      filter: (path) => path !== join(root, "node_modules") && path !== join(root, "dist"),
    });
    const repository = join(root, "..");
    const lock = readFileSync(join(repository, "bun.lock"), "utf8");
    for (const name of ["package.json", "bun.lock", "bunfig.toml"]) {
      cpSync(join(repository, name), join(directory, name));
    }
    const manifest = JSON.parse(readFileSync(join(repository, "package.json"), "utf8"));
    for (const path of globSync(
      manifest.workspaces.map((workspace: string) => `${workspace}/package.json`),
      {
        cwd: repository,
      },
    )) {
      const target = join(directory, path);
      mkdirSync(join(target, ".."), { recursive: true });
      cpSync(join(repository, path), target);
    }
    const run = (command: string, args: string[]) => {
      const result = spawnSync(command, args, {
        cwd: packageDir,
        env,
        encoding: "utf8",
        timeout: 180_000,
        maxBuffer: 4 * 1024 * 1024,
      });
      expect(result.error, `${command} ${args.join(" ")}`).toBeUndefined();
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      return result.stdout;
    };
    expect(run(process.execPath, [bbCli, "--version"]).trim()).toBe(
      pluginManifest.devDependencies["bb-app"],
    );
    run("bun", [
      "install",
      "--filter",
      "bb-plugin-pi-subagents-provider",
      "--frozen-lockfile",
      "--production",
      "--omit=optional",
      "--ignore-scripts",
    ]);
    expect(readFileSync(join(directory, "bun.lock"), "utf8")).toBe(lock);
    for (const name of [
      "@get-bb/plugin-sdk",
      "bb-app",
      "vitest",
      "typescript",
      "@earendil-works/pi-coding-agent",
    ]) {
      expect(existsSync(join(packageDir, "node_modules", name)), name).toBe(false);
      expect(existsSync(join(directory, "node_modules", name)), name).toBe(false);
    }
    run(process.execPath, [bbCli, "plugin", "types", packageDir, "--check"]);
    run(process.execPath, [bbCli, "plugin", "build", packageDir]);
    for (const artifact of ["server", "host", "app"]) {
      const metadata = JSON.parse(
        readFileSync(join(packageDir, "dist", `${artifact}.meta.json`), "utf8"),
      );
      expect(metadata).toMatchObject({
        pluginId: "pi-subagents-provider",
        pluginVersion: pluginManifest.version,
        artifactFormatVersion: 1,
        sdkVersion: pluginManifest.devDependencies["@get-bb/plugin-sdk"],
        builtWith: {
          bbVersion: pluginManifest.devDependencies["bb-app"],
          pluginSdkVersion: pluginManifest.devDependencies["@get-bb/plugin-sdk"],
        },
      });
    }
    const output = run(process.execPath, [
      "--input-type=module",
      "--eval",
      `
      import assert from "node:assert/strict";
      import plugin from "./dist/server.js";
      import hostEntry, { experimental_providerBridge as bridge } from "./dist/host.js";
      import { BRIDGE_JSON_RPC_ERRORS } from "@get-bb/plugin-sdk-runtime/provider-bridge";
      import { createFakePluginHost } from ${JSON.stringify(testingUrl)};
      import { experimental_createHostEntryHarness } from ${JSON.stringify(hostTestingUrl)};
      await assert.rejects(import("@get-bb/plugin-sdk/provider-bridge"), { code: "ERR_MODULE_NOT_FOUND" });
      const { bb, harness } = createFakePluginHost({ pluginId: "pi-subagents-provider" });
      plugin(bb);
      assert.deepEqual(harness.registrations.providerRegistrations.map(entry => entry.id), ["pi-subagents"]);
      const host = experimental_createHostEntryHarness(hostEntry);
      const roots = await host.experimental_call("resolveNativeRoots", { cwd: null, providerId: "pi-subagents" });
      assert.ok(roots);
      await host.experimental_dispose();
      await harness.lifecycle.dispose();
      assert.equal(bridge.experimental_apiVersion, 1);
      assert.equal(BRIDGE_JSON_RPC_ERRORS.METHOD_NOT_FOUND, -32601);
      bridge.handleLine(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "packaging/unknown", params: {} }));
    `,
    ]);
    expect(JSON.parse(output.trim())).toMatchObject({ id: 1, error: { code: -32601 } });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 240_000);
