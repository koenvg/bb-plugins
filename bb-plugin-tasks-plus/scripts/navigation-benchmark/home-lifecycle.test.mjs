import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLocalHarness } from "./local-lifecycle.mjs";

const json = async (output, name) => JSON.parse(await readFile(join(output, name), "utf8"));

test(
  "home evidence and browser close failures preserve startup error and close an already-exited owned child",
  { timeout: 5000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "home-lifecycle-"));
    const output = join(root, "run");
    const original = new Error("Server exit 7");
    try {
      await assert.rejects(
        runLocalHarness({
          output,
          phase: "home",
          execute: async ({ resources, capture }) => {
            const child = (resources.serverProcess = spawn(process.execPath, [
              "-e",
              "process.exit(7)",
            ]));
            await once(child, "exit");
            resources.browser = {
              close: async () => {
                throw new Error("browser close rejected");
              },
            };
            await mkdir(join(output, "partial.json"));
            try {
              throw original;
            } finally {
              await capture("partial.json", () => ({ retained: true }));
              await capture("server.log", () => "Server exit 7");
            }
          },
        }),
        (error) => error === original,
      );
      const ledger = await json(output, "ownership-ledger.json");
      assert.match(ledger.originalFailure, /Server exit 7/);
      assert.equal(ledger.captures["partial.json"].status, "failed");
      assert.equal(ledger.cleanup.browser.status, "failed");
      assert.equal(ledger.cleanup.serverProcess.status, "closed");
      assert.equal(await readFile(join(output, "server.log"), "utf8"), "Server exit 7");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test("home calls write and endpoint close failures still dispose the backend", async () => {
  const root = await mkdtemp(join(tmpdir(), "home-lifecycle-"));
  const output = join(root, "run");
  let disposed = false;
  try {
    await assert.rejects(
      runLocalHarness({
        output,
        phase: "home-server",
        execute: async ({ resources, capture }) => {
          resources.server = {
            close: (callback) => callback(new Error("endpoint close rejected")),
          };
          resources.backend = {
            calls: [],
            dispose: async () => {
              disposed = true;
            },
          };
          await mkdir(join(output, "calls.json"));
          await capture("calls.json", () => resources.backend.calls);
        },
      }),
      /cleanup or evidence failed/,
    );
    const ledger = await json(output, "ownership-ledger.json");
    assert.equal(disposed, true);
    assert.equal(ledger.captures["calls.json"].status, "failed");
    assert.equal(ledger.cleanup.endpoint.status, "failed");
    assert.equal(ledger.cleanup.database.status, "closed");
    assert.equal(ledger.status, "failed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test(
  "home CLI early server exit publishes its original failure and cleanup without launching Chromium",
  { timeout: 5000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "home-cli-"));
    const output = join(root, "run");
    const hook = `
    import { registerHooks } from "node:module";
    registerHooks({
      load(url, context, next) {
        if (url.endsWith("/home-server.mjs"))
          return { format: "module", source: "process.exit(7)", shortCircuit: true };
        return next(url, context);
      },
    });
  `;
    const preload = "data:text/javascript," + encodeURIComponent(hook);
    try {
      const child = spawn(
        process.execPath,
        [new URL("./home-measure.mjs", import.meta.url).pathname, output],
        {
          env: { ...process.env, NODE_OPTIONS: "--import=" + preload },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.stdout.resume();
      const [code] = await once(child, "exit");
      assert.equal(code, 1);
      assert.match(stderr, /Server exit 7/);
      const ledger = await json(output, "ownership-ledger.json");
      assert.match(ledger.originalFailure, /Server exit 7/);
      assert.equal(ledger.cleanup.browser.status, "not-acquired-or-already-closed");
      assert.equal(ledger.cleanup.serverProcess.status, "closed");
      assert.equal(ledger.captures["server.log"].status, "saved");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test(
  "home CLI evidence write and browser close failures cannot mask the original error or skip child closure",
  { timeout: 5000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "home-cli-failure-"));
    const output = join(root, "run");
    const hook = `
    import { registerHooks } from "node:module";
    registerHooks({
      load(url, context, next) {
        if (url.endsWith("/home-server.mjs"))
          return { format: "module", source: 'console.log(\`BB_FIXTURE_READY {"origin":"http://127.0.0.1:1"}\`); process.once("SIGTERM", () => process.exit(0));', shortCircuit: true };
        if (url.endsWith("/@playwright/test/index.js"))
          return { format: "commonjs", source: \`
            const fs = require("node:fs");
            const page = {
              on() {},
              async goto() {
                fs.mkdirSync(process.argv[2] + "/partial.json");
                throw new Error("original page failure");
              },
              async evaluate() { return { samples: [] }; }
            };
            exports.chromium = {
              async launch() { return {
                async newContext() { return { route: async () => {}, newPage: async () => page }; },
                async close() { throw new Error("browser close rejected"); }
              }; }
            };
          \`, shortCircuit: true };
        return next(url, context);
      },
    });
  `;
    try {
      const child = spawn(
        process.execPath,
        [new URL("./home-measure.mjs", import.meta.url).pathname, output],
        {
          env: {
            ...process.env,
            NODE_OPTIONS: "--import=data:text/javascript," + encodeURIComponent(hook),
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.stdout.resume();
      const [code] = await once(child, "exit");
      assert.equal(code, 1);
      assert.match(stderr, /original page failure/);
      const ledger = await json(output, "ownership-ledger.json");
      assert.match(ledger.originalFailure, /original page failure/);
      assert.equal(ledger.captures["partial.json"].status, "failed");
      assert.equal(ledger.cleanup.browser.status, "failed");
      assert.match(ledger.cleanup.browser.error, /browser close rejected/);
      assert.equal(ledger.cleanup.serverProcess.status, "closed");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
