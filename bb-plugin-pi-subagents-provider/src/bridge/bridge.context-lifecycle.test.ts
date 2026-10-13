import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Readable, type Writable } from "node:stream";
import { afterEach, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { runInNewContext } from "node:vm";
import { Type } from "typebox";
import { BB_PI_EXTENSION_SOURCE } from "./bb-pi-extension.js";

const cli = join(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")), "..", "cli.js");
const children: ChildProcess[] = [];
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(children.splice(0).map((child) => new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once("exit", () => resolve());
    child.kill("SIGKILL");
  })));
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function startPi(projectTrust = false, runtime = process.execPath) {
  const root = mkdtempSync(join(tmpdir(), "bb-pi-context-"));
  roots.push(root);
  const agentDir = join(root, "agent");
  mkdirSync(agentDir);
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ defaultTools: [] }));
  const extension = join(root, "bb-extension.mjs");
  writeFileSync(extension, BB_PI_EXTENSION_SOURCE);
  const controls = join(root, "controls.mjs");
  writeFileSync(controls, `export default function(pi) {
    pi.on("project_trust", () => ({ trusted: true }));
    pi.registerCommand("bb-test-reload", { handler: async (_, ctx) => { await ctx.reload(); } });
  }`);
  if (projectTrust) {
    mkdirSync(join(root, ".pi"));
    writeFileSync(join(root, ".pi", "settings.json"), "{}");
    mkdirSync(join(root, ".pi", "extensions"));
    writeFileSync(join(root, ".pi", "extensions", "project.mjs"), "export default function() {}");
  }
  const child = spawn(runtime, [cli, "--mode", "rpc", "--no-session", ...(projectTrust ? [] : ["-ne"]), "--extension", extension, "--extension", controls], {
    cwd: root,
    env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_BB_TOOLS_FILE: "" },
    stdio: ["pipe", "pipe", "pipe", "pipe", "pipe"],
  });
  children.push(child);
  const messages: Record<string, unknown>[] = [];
  let stderr = "";
  child.stderr!.on("data", (chunk) => { stderr += String(chunk); });
  for (const stream of [child.stdout!, child.stdio[3] as Readable]) {
    let pending = "";
    stream.on("data", (chunk) => {
      pending += String(chunk);
      let index;
      while ((index = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, index);
        pending = pending.slice(index + 1);
        if (line) messages.push(JSON.parse(line));
      }
    });
  }
  let nextId = 0;
  async function waitFor(predicate: (message: Record<string, unknown>) => boolean) {
    for (let attempt = 0; attempt < 500; attempt++) {
      const index = messages.findIndex(predicate);
      if (index >= 0) return messages.splice(index, 1)[0]!;
      if (child.exitCode !== null) throw new Error(`Pi exited: ${stderr}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`Pi response timeout: ${stderr}; ${JSON.stringify(messages)}`);
  }
  async function rpc(type: string, fields: Record<string, unknown> = {}) {
    const id = `rpc-${++nextId}`;
    child.stdin!.write(JSON.stringify({ id, type, ...fields }) + "\n");
    const reply = await waitFor((message) => message.type === "response" && message.id === id);
    expect(reply.success, JSON.stringify(reply)).toBe(true);
    return reply.data as Record<string, unknown>;
  }
  async function channel(method: string) {
    const id = `channel-${++nextId}`;
    (child.stdio[4] as Writable).write(JSON.stringify({ kind: "request", id, method }) + "\n");
    const reply = await waitFor((message) => message.kind === "reply" && message.id === id);
    expect(reply.error, JSON.stringify(reply)).toBeUndefined();
    return reply.result;
  }
  await rpc("get_state");
  await waitFor((message) => message.kind === "ready");
  const sessionPath = join(root, "switched.jsonl");
  const timestamp = new Date().toISOString();
  writeFileSync(sessionPath, [
    { type: "session", version: 3, id: "11111111-1111-4111-8111-111111111111", timestamp, cwd: root },
    { type: "custom", id: "switched-leaf", parentId: null, timestamp, customType: "probe", data: {} },
  ].map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  return { rpc, channel, sessionPath };
}

it("reads the active context after project-trust resource replacement", async () => {
  const pi = await startPi(true);
  expect(await pi.channel("leaf")).toHaveProperty("leafId");
  expect(await pi.channel("model-scope")).toHaveProperty("scopedModelIds");
}, 20_000);

it("keeps the bridge channel usable after session replacement and reload", async () => {
  const pi = await startPi();
  await pi.rpc("new_session");
  expect(await pi.channel("leaf")).toHaveProperty("leafId");
  await pi.rpc("prompt", { message: "/bb-test-reload" });
  expect(await pi.channel("model-scope")).toHaveProperty("scopedModelIds");
  await pi.rpc("new_session");
  expect(await pi.channel("leaf")).toHaveProperty("leafId");
  await pi.rpc("switch_session", { sessionPath: pi.sessionPath });
  expect(await pi.channel("subagent-inspection-context")).toMatchObject({
    sessionId: "11111111-1111-4111-8111-111111111111", sessionFile: pi.sessionPath,
  });
  expect(await pi.channel("leaf")).toHaveProperty("leafId");
}, 30_000);

it("keeps the Bun channel usable after session replacement and reload", async () => {
  const pi = await startPi(false, "bun");
  await pi.rpc("new_session");
  expect(await pi.channel("leaf")).toHaveProperty("leafId");
  await pi.rpc("prompt", { message: "/bb-test-reload" });
  expect(await pi.channel("model-scope")).toHaveProperty("scopedModelIds");
}, 30_000);

it("ignores late tool results from a replaced session", async () => {
  const replies: Record<string, unknown>[] = [];
  const readers: EventEmitter[] = [];
  class BridgeSocket extends EventEmitter {
    constructor() { super(); readers.push(this); }
    unref() {}
  }
  const source = BB_PI_EXTENSION_SOURCE
    .replace(/^import .+;$/gm, "")
    .replace("export default function bbExtension", "function bbExtension");
  const factory = runInNewContext(source + "\nbbExtension;", {
    Socket: BridgeSocket, StringDecoder: (await import("node:string_decoder")).StringDecoder,
    Type, Buffer, Symbol, randomUUID, setTimeout, clearTimeout,
    process: { env: { PI_BB_TOOLS_FILE: "tools.json" } },
    readFileSync: () => JSON.stringify([{ name: "probe", description: "probe", inputSchema: {} }]),
    writeSync: (_fd: number, buffer: Buffer, offset: number, length: number) => {
      replies.push(JSON.parse(buffer.subarray(offset, offset + length).toString()));
      return length;
    },
  }) as (pi: {
    on: (event: string, handler: (event: unknown, ctx: unknown) => unknown) => void;
    registerTool: (tool: { execute: () => Promise<{ content: unknown }> }) => void;
  }) => void;
  async function start() {
    const handlers = new Map<string, ((event: unknown, ctx: unknown) => unknown)[]>();
    let tool!: { execute: () => Promise<{ content: unknown }> };
    factory({
      on(event, handler) {
        const list = handlers.get(event) ?? [];
        list.push(handler);
        handlers.set(event, list);
      },
      registerTool(value) { tool = value; },
    });
    const emit = async (event: string) => {
      for (const handler of handlers.get(event) ?? []) await handler({}, {});
    };
    await emit("session_start");
    return { tool, shutdown: () => emit("session_shutdown") };
  }
  const old = await start();
  const oldResult = old.tool.execute();
  const shutdownError = expect(oldResult).rejects.toThrow("Pi session shut down");
  const oldId = replies.find((message) => message.kind === "tool-call")!.id;
  await old.shutdown();
  await shutdownError;
  replies.length = 0;
  const current = await start();
  const currentResult = current.tool.execute();
  const currentId = replies.find((message) => message.kind === "tool-call")!.id;
  expect(readers).toHaveLength(1);
  const sendResult = (id: unknown, text: string) => readers[0]!.emit("data", Buffer.from(
    JSON.stringify({ kind: "tool-result", id, content: [{ type: "text", text }] }) + "\n",
  ));
  sendResult(oldId, "OLD SESSION RESULT");
  sendResult(currentId, "CURRENT SESSION RESULT");
  expect(await currentResult).toEqual({ content: [{ type: "text", text: "CURRENT SESSION RESULT" }], details: {} });
  expect(currentId).not.toBe(oldId);
  await current.shutdown();
});
