import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "bun:test";

const repository = fileURLToPath(new URL("../", import.meta.url));
const previews = [
  {
    name: "codex-quota",
    entry: "scripts/preview-server.mjs",
    key: "CODEX_QUOTA_PREVIEW_PORT",
    path: "/calendar.html",
    marker: "calendar.js",
  },
  {
    name: "compose-chat",
    entry: "tests/preview-server.ts",
    key: "COMPOSE_CHAT_PREVIEW_PORT",
    path: "/tests/preview.html",
    marker: "/dist/app.js",
  },
  {
    name: "markdown-reader",
    entry: "tests/preview-server.ts",
    key: "MARKDOWN_READER_PREVIEW_PORT",
    path: "/",
    marker: "/tests/preview.tsx",
  },
];
function start(preview, parent, port, args = []) {
  const env = { ...process.env, TMPDIR: parent, TMP: parent, TEMP: parent };
  delete env.BB_FIXTURE_RUN_DIR;
  delete env.BB_FIXTURE_PORT;
  delete env[preview.key];
  if (port !== undefined) env[preview.key] = port;
  const child = spawn(process.execPath, [preview.entry, ...args], {
    cwd: join(repository, `bb-plugin-${preview.name}`),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = once(child, "exit");
  let output = "";
  let ready;
  const readiness = new Promise((resolve) => {
    ready = resolve;
  });
  child.stdout.on("data", (data) => {
    output += data.toString();
    const match = output.match(/Synthetic preview ready at (http:\/\/127\.0\.0\.1:\d+)/);
    if (match) ready(match[1]);
  });
  child.stderr.on("data", (data) => (output += data.toString()));
  return {
    child,
    exited,
    output: () => output,
    async ready() {
      return Promise.race([
        readiness,
        exited.then(() => {
          throw new Error(output);
        }),
        delay(15000).then(() => {
          throw new Error(`Readiness timed out: ${output}`);
        }),
      ]);
    },
    async stop() {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
        await exited;
      }
    },
  };
}
for (const preview of previews) {
  test(`${preview.name} real ephemeral bind, strict refusal and owned cleanup`, async () => {
    const parent = await mkdtemp(join(tmpdir(), "preview-contract-"));
    const owners = [];
    let moduleDirectory;
    await writeFile(join(parent, "historical.png"), "keep");
    const dist = join(repository, `bb-plugin-${preview.name}`, "dist");
    const before = await readdir(dist).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    try {
      const first = start(preview, parent);
      owners.push(first);
      const origin = await first.ready();
      const second = start(
        preview,
        parent,
        undefined,
        preview.name === "markdown-reader" ? ["--port=0", "--strictPort"] : [],
      );
      owners.push(second);
      const secondOrigin = await second.ready();
      assert.notEqual(secondOrigin, origin);
      const response = await fetch(origin + preview.path);
      assert.equal(response.status, 200);
      assert.ok((await response.text()).includes(preview.marker));
      if (preview.name === "compose-chat") {
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal((await fetch(origin + preview.path, { method: "HEAD" })).status, 200);
        assert.equal(await (await fetch(origin + preview.path, { method: "HEAD" })).text(), "");
        assert.equal((await fetch(origin + preview.path, { method: "POST" })).status, 404);
      }
      if (preview.name === "codex-quota") {
        assert.ok(response.headers.get("content-security-policy").includes("connect-src 'none'"));
        assert.equal((await fetch(origin + "/speed-fixture.mjs")).status, 404);
      }
      if (preview.name === "markdown-reader") {
        assert.equal((await fetch(origin + "/tests/preview.tsx")).status, 200);
        moduleDirectory = await mkdtemp(
          join(repository, "bb-plugin-markdown-reader/tests/browser-hmr-contract-"),
        );
        const modulePath = `/tests/${moduleDirectory.split("/").at(-1)}/live.ts`;
        const moduleFile = join(moduleDirectory, "live.ts");
        await writeFile(
          moduleFile,
          'export const marker = "before"; if (import.meta.hot) import.meta.hot.accept();',
        );
        assert.equal((await fetch(origin + modulePath)).status, 200);
        const ws = new WebSocket(origin.replace("http:", "ws:") + "/", "vite-hmr");
        const message = (type) =>
          new Promise((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error(`Missing HMR ${type} on owned listener`)),
              5000,
            );
            ws.onmessage = (event) => {
              const value = JSON.parse(event.data);
              if (value.type === type) {
                clearTimeout(timer);
                resolve(value);
              }
            };
            ws.onerror = (error) => {
              clearTimeout(timer);
              reject(error);
            };
          });
        try {
          await message("connected");
          const update = message("update");
          await writeFile(
            moduleFile,
            'export const marker = "after"; if (import.meta.hot) import.meta.hot.accept();',
          );
          const receipt = await update;
          assert.equal(receipt.type, "update");
          assert.equal(receipt.updates[0].path, modulePath);
          assert.equal(receipt.updates[0].acceptedPath, modulePath);
        } finally {
          ws.close();
        }
      }
      assert.equal(
        (await fetch(origin + "/../package.json")).status,
        preview.name === "markdown-reader" ? 200 : 404,
      );
      const conflict =
        preview.name === "markdown-reader"
          ? start(preview, parent, "0", ["--port", new URL(origin).port, "--strictPort"])
          : start(preview, parent, new URL(origin).port);
      owners.push(conflict);
      assert.notEqual((await conflict.exited)[0], 0);
      assert.match(conflict.output(), /EADDRINUSE/);
      assert.equal((await fetch(origin + preview.path)).status, 200);
      const invalid = start(preview, parent, "");
      owners.push(invalid);
      assert.notEqual((await invalid.exited)[0], 0);
      assert.match(invalid.output(), /Invalid .*port|Invalid .*PORT/);
      await Promise.all(owners.map((owner) => owner.stop()));
      assert.deepEqual(await readdir(parent), ["historical.png"]);
      assert.equal(await readFile(join(parent, "historical.png"), "utf8"), "keep");
      assert.deepEqual(
        await readdir(dist).catch((error) => {
          if (error.code === "ENOENT") return null;
          throw error;
        }),
        before,
      );
      await assert.rejects(fetch(origin + preview.path));
    } finally {
      await Promise.all(owners.map((owner) => owner.stop()));
      await rm(parent, { recursive: true, force: true });
      if (moduleDirectory) await rm(moduleDirectory, { recursive: true, force: true });
    }
  }, 45000);
  if (preview.name !== "compose-chat") {
    test(`${preview.name} direct cancellation adopts its fresh startup directory`, async () => {
      const parent = await mkdtemp(join(tmpdir(), "preview-startup-contract-"));
      const owner = start(preview, parent);
      try {
        for (let n = 0; n < 1000; n++) {
          if ((await readdir(parent)).length) break;
          if (owner.child.exitCode !== null) throw new Error(owner.output());
          await delay(1);
        }
        owner.child.kill("SIGTERM");
        assert.equal((await owner.exited)[0], 0, owner.output());
        assert.equal(owner.output().includes("Synthetic preview ready"), false);
        assert.deepEqual(await readdir(parent), []);
      } finally {
        await owner.stop();
        await rm(parent, { recursive: true, force: true });
      }
    }, 20000);
  }
}
