import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

test("owned preview shutdown and occupied-port failure preserve other receipts", async () => {
  const parent = await mkdtemp(join(tmpdir(), "quota-preview-lifecycle-"));
  const historical = join(parent, "historical.png");
  await writeFile(historical, "keep");
  const start = (port: string) =>
    spawn(process.execPath, ["scripts/preview-server.mjs"], {
      env: {
        ...process.env,
        TMPDIR: parent,
        TMP: parent,
        TEMP: parent,
        CODEX_QUOTA_PREVIEW_PORT: port,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
  const server = start("0");
  const closed = once(server, "exit");
  try {
    const ready = await new Promise<string>((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      server.stdout.on("data", (data) => {
        stdout += data.toString();
        if (stdout.includes("Synthetic preview ready")) resolve(stdout);
      });
      server.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      server.once("error", reject);
      server.once("exit", () => reject(new Error(`Server exited before readiness: ${stderr}`)));
    });
    const base = ready.match(/http:\/\/127\.0\.0\.1:\d+/)![0];
    const root = ready.match(/\((.+)\)/)![1];
    const response = await fetch(`${base}/calendar.html`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("connect-src 'none'");
    expect((await fetch(`${base}/package.json`)).status).toBe(404);
    expect((await readdir(root)).sort()).toEqual([
      "activity.html",
      "activity.js",
      "app.css",
      "calendar.html",
      "calendar.js",
      "collector.html",
      "collector.js",
      "identity.html",
      "identity.js",
      "import.html",
      "import.js",
    ]);
    const conflict = start(new URL(base).port);
    const conflictClosed = once(conflict, "exit");
    let errors = "";
    conflict.stderr.on("data", (data) => {
      errors += data.toString();
    });
    conflict.stdout.resume();
    expect((await conflictClosed)[0]).not.toBe(0);
    expect(errors).toContain("EADDRINUSE");
    expect((await fetch(`${base}/activity.html`)).status).toBe(200);
    expect((await readdir(parent)).sort()).toEqual(
      [root.split(/[\\/]/).at(-1), "historical.png"].sort(),
    );
    server.kill("SIGTERM");
    expect((await closed)[0]).toBe(0);
    expect(await readdir(parent)).toEqual(["historical.png"]);
    expect(await readFile(historical, "utf8")).toBe("keep");
  } finally {
    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await closed;
    }
    await rm(parent, { recursive: true, force: true });
  }
}, 20_000);
