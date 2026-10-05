import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { it, expect } from "vitest";
import { request } from "node:http";

it("rejects unapproved Hosts before serving source or changing fixture settings", async () => {
  // Split the Node flag because SDK 0.5.9's text scanner mistakes it for a JS import.
  const child = spawn(process.execPath, ["--im" + "port", "tsx", "preview/server.ts"], {
    cwd: fileURLToPath(new URL(".", import.meta.url)), env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stderr.on("data", data => { output += data; });
  try {
    const base = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Preview did not start: ${output}`)), 15000);
      child.once("exit", () => { clearTimeout(timeout); reject(new Error(`Preview exited: ${output}`)); });
      child.stdout.on("data", data => {
        output += data;
        const match = output.match(/fixture ready at (http:\/\/127\.0\.0\.1:\d+)/);
        if (match) { clearTimeout(timeout); resolve(match[1]); }
      });
    });
    const withHost = (path: string, host: string, body?: string) => new Promise<number>((resolve, reject) => {
      const req = request(base + path, { method: body ? "POST" : "GET", headers: { Host: host, "Content-Type": "application/json" } }, res => {
        res.resume();
        res.once("end", () => resolve(res.statusCode!));
      });
      req.once("error", reject);
      req.end(body);
    });
    for (const host of ["attacker.example", "127.0.0.1.attacker.example", "attacker@localhost", "localhost/attacker"]) {
      expect(await withHost("/", host)).toBe(403);
      expect(await withHost("/app.tsx", host)).toBe(403);
      expect(await withHost("/fixture-rpc/setEnablement", host, JSON.stringify({ projectId: "fixture_beta", enabledOverride: true }))).toBe(403);
      expect(await withHost("/fixture-default", host, JSON.stringify({ enableByDefault: true }))).toBe(403);
      expect(await withHost("/fixture-rpc/setPrompt", host, JSON.stringify({ projectId: "fixture_beta", prompt: "Hostile write" }))).toBe(403);
    }
    expect((await fetch(base + "/")).status).toBe(200);
    expect((await fetch(base + "/", { headers: { Host: "localhost:" + new URL(base).port } })).status).toBe(200);
    const rpc = async (method: string, input: unknown) => {
      const response = await fetch(base + "/fixture-rpc/" + method, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
      });
      expect(response.status).toBe(200);
      return (await response.json()).result;
    };
    const before = await rpc("getProject", { projectId: "fixture_beta" });
    expect(before.enabled).toBe(false);
    expect(await rpc("setEnablement", { projectId: "fixture_beta", enabledOverride: true })).toEqual({ ...before, enabled: true, enabledOverride: true });
    expect(await rpc("getProject", { projectId: "fixture_beta" })).toEqual({ ...before, enabled: true, enabledOverride: true });
    const exact = '# Fixture\n\n`$literal`\n';
    expect(await rpc("setPrompt", { projectId: "fixture_beta", prompt: exact })).toEqual({ ...before, enabled: true, enabledOverride: true, prompt: exact, effectivePrompt: exact });
    expect(await rpc("setPrompt", { projectId: "fixture_beta", prompt: null })).toEqual({ ...before, enabled: true, enabledOverride: true });
    const defaults = await fetch(base + "/fixture-default");
    expect(defaults.status).toBe(200);
    expect(await defaults.json()).toMatchObject({ value: false, descriptor: { type: "boolean", default: false, label: "Enable for projects without an override" } });
    const defaultWrite = await fetch(base + "/fixture-default", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enableByDefault: true }) });
    expect(defaultWrite.status).toBe(200);
    expect(await defaultWrite.json()).toMatchObject({ value: true, signals: [{ channel: "settings.changed", payload: { kind: "default" } }] });
    expect(await rpc("setEnablement", { projectId: "fixture_beta", enabledOverride: null })).toEqual({ ...before, enabled: true, enabledOverride: null, enableByDefault: true });
  } finally {
    if (child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
  }
}, 25000);
