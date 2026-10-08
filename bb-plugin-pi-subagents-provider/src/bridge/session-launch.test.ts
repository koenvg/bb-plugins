import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PI_BRIDGE_ARGS_ENV, PI_BRIDGE_COMMAND_ENV, type PiRpcChild } from "./rpc-child.js";
import type { PiRpcSessionOptions } from "./rpc-session.js";
import { spawnPiSessionChild } from "./session-launch.js";

let dir: string;
let options: PiRpcSessionOptions;
let child: PiRpcChild | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "bb-pi-session-launch-"));
  options = {
    cwd: dir,
    scratchDir: join(dir, "scratch"),
    sessionFilePath: join(dir, "sessions", "session.jsonl"),
    sessionDir: join(dir, "sessions"),
    extensionPath: join(dir, "extension.mjs"),
    recordThreadId: "thr_launch_test",
    systemPrompt: "system prompt",
    appendSystemPrompt: "append prompt",
    model: { provider: "test", id: "model" },
    thinkingLevel: "high",
    additionalSkillPaths: [join(dir, "skill")],
    dynamicTools: [{ name: "probe", description: "A probe", inputSchema: { type: "object" } }],
    shellEnvOverrides: { LAUNCH_TEST_VALUE: "present" },
  };
  vi.stubEnv(PI_BRIDGE_COMMAND_ENV, process.execPath);
});

afterEach(async () => {
  child?.kill();
  await child?.waitForExit();
  child = undefined;
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

it.each([false, true])(
  "materializes launch inputs until child exit, noSession=%s",
  async (noSession) => {
    const script = `
    const fs = require("node:fs");
    const readline = require("node:readline");
    const args = process.argv.slice(1);
    const readPrompt = (flag) => fs.readFileSync(args[args.indexOf(flag) + 1], "utf8");
    const input = readline.createInterface({ input: process.stdin });
    input.on("line", (line) => {
      const request = JSON.parse(line);
      process.stdout.write(JSON.stringify({ type: "response", id: request.id, success: true, data: {
        args, systemPrompt: readPrompt("--system-prompt"), appendPrompt: readPrompt("--append-system-prompt"),
        tools: JSON.parse(fs.readFileSync(process.env.PI_BB_TOOLS_FILE, "utf8")),
        env: process.env.LAUNCH_TEST_VALUE,
      } }) + "\\n");
    });
    input.on("close", () => process.exit(0));
  `;
    vi.stubEnv(PI_BRIDGE_ARGS_ENV, JSON.stringify(["-e", script, "--"]));
    const onExit = vi.fn(() => expect(readdirSync(options.scratchDir)).toEqual([]));
    child = spawnPiSessionChild(
      { ...options, noSession },
      {
        onEvent: () => undefined,
        onChannelMessage: () => undefined,
        onExit,
      },
    );
    const result = (await child.requestOk({ type: "get_state" })) as { args: string[] };
    const files = readdirSync(options.scratchDir);
    expect(files).toHaveLength(3);
    const systemFile = files.find((file) => file.startsWith("pi-system-"))!;
    const appendFile = files.find((file) => file.startsWith("pi-append-"))!;
    expect(result).toEqual({
      args: [
        "--mode",
        "rpc",
        ...(noSession ? ["--no-session"] : ["--session", options.sessionFilePath]),
        "--session-dir",
        options.sessionDir,
        "--extension",
        options.extensionPath,
        "--system-prompt",
        join(options.scratchDir, systemFile),
        "--append-system-prompt",
        join(options.scratchDir, appendFile),
        "--skill",
        options.additionalSkillPaths![0],
        "--model",
        "test/model",
        "--thinking",
        "high",
      ],
      systemPrompt: options.systemPrompt,
      appendPrompt: options.appendSystemPrompt,
      tools: options.dynamicTools,
      env: "present",
    });
    child.closeGracefully();
    await child.waitForExit();
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(readdirSync(options.scratchDir)).toEqual([]);
  },
);

it("removes launch files when child construction throws synchronously", () => {
  vi.stubEnv(PI_BRIDGE_ARGS_ENV, "not-json");
  expect(() =>
    spawnPiSessionChild(options, {
      onEvent: () => undefined,
      onChannelMessage: () => undefined,
      onExit: () => undefined,
    }),
  ).toThrow();
  expect(readdirSync(options.scratchDir)).toEqual([]);
});
