import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildPiChildEnv, PiRpcChild, type SpawnPiRpcChildArgs } from "./rpc-child.js";
import type { PiRpcSessionOptions } from "./rpc-session.js";

/** The child owns launch files until exit, including a discarded auth attempt. */
export function spawnPiSessionChild(
  options: PiRpcSessionOptions,
  handlers: Pick<
    SpawnPiRpcChildArgs,
    "onEvent" | "onChannelMessage" | "onExit" | "onExtensionUiRequest"
  >,
): PiRpcChild {
  const files: string[] = [];
  const cleanup = () => {
    for (const file of files) rmSync(file, { force: true });
  };
  try {
    const toolsFilePath = join(
      options.scratchDir,
      `pi-tools-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
    );
    mkdirSync(dirname(toolsFilePath), { recursive: true });
    files.push(toolsFilePath);
    writeFileSync(toolsFilePath, JSON.stringify(options.dynamicTools ?? []), "utf8");

    const args: string[] = ["--mode", "rpc"];
    if (options.noSession) {
      args.push("--no-session");
    } else {
      mkdirSync(dirname(options.sessionFilePath), { recursive: true });
      args.push("--session", options.sessionFilePath);
    }
    args.push("--session-dir", options.sessionDir, "--extension", options.extensionPath);
    const stamp = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    for (const [prompt, flag, prefix] of [
      [options.systemPrompt, "--system-prompt", "pi-system"],
      [options.appendSystemPrompt, "--append-system-prompt", "pi-append"],
    ] as const) {
      if (prompt === undefined) continue;
      const file = join(options.scratchDir, `${prefix}-${stamp}.md`);
      files.push(file);
      writeFileSync(file, prompt, "utf8");
      args.push(flag, file);
    }
    for (const skillPath of options.additionalSkillPaths ?? []) args.push("--skill", skillPath);
    if (options.model) args.push("--model", `${options.model.provider}/${options.model.id}`);
    if (options.thinkingLevel) args.push("--thinking", options.thinkingLevel);

    return new PiRpcChild({
      ...handlers,
      cwd: options.cwd,
      env: buildPiChildEnv({ ...options.shellEnvOverrides, PI_BB_TOOLS_FILE: toolsFilePath }),
      args,
      recordThreadId: options.recordThreadId,
      onExit: (info) => {
        cleanup();
        handlers.onExit(info);
      },
    });
  } catch (error) {
    cleanup();
    throw error;
  }
}
