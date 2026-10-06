import {
  PluginCliError,
  cliCommand,
  type PluginCliContext,
  type PluginCliResult,
} from "@get-bb/plugin-sdk";
import { z } from "zod";
import type { registerHandlers } from "../api";
import { errorMessage } from "../shared/errors";
import { oneLine } from "./format";

const JSON_OPTION = {
  type: "boolean",
  description: "Emit machine-readable JSON",
} as const;

const MACHINE_OPTION = {
  type: "string",
  placeholder: "id-or-name",
  description:
    "Enrolled machine that owns the file paths; defaults to the invoking thread's machine, otherwise the server's",
} as const;

const PROJECT_OPTION = {
  type: "string",
  placeholder: "prefix-or-id",
  description:
    "Tracker project prefix or id such as ABC, never a bb project id (proj_...); run bb tasks project list",
} as const;

const REQUIRED_PROJECT_OPTION = {
  ...PROJECT_OPTION,
  description: `${PROJECT_OPTION.description} (required)`,
} as const;

const KEY_POSITIONAL = {
  name: "key-or-id",
  description: "Task key such as ABC-12 (case-insensitive) or its ULID",
  required: true,
} as const;

interface PluginStatus {
  name: string;
  version: string;
}

type TasksDomain = ReturnType<typeof registerHandlers>;

class CliError extends PluginCliError {
  constructor(message: string, options?: { code?: string; hint?: string; exitCode?: number }) {
    super(oneLine(message), options);
  }
}

function friendlyError(error: unknown): string {
  if (error instanceof PluginCliError) return error.message;
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    const path = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    return `${path}${issue?.message ?? "invalid input"}`;
  }
  const message = errorMessage(error);
  if (message.includes("UNIQUE constraint failed: projects.prefix")) {
    return "project prefix is already in use";
  }
  if (message.includes("UNIQUE constraint failed: labels.project_id, labels.name")) {
    return "label name is already in use in this project";
  }
  return message;
}

async function guard(action: () => Promise<string | PluginCliResult>): Promise<PluginCliResult> {
  try {
    const result = await action();
    return typeof result === "string" ? { exitCode: 0, stdout: result } : result;
  } catch (error) {
    if (error instanceof PluginCliError) throw error;
    throw new CliError(friendlyError(error));
  }
}

function withWarnings(stdout: string, warnings: readonly string[]): string | PluginCliResult {
  if (warnings.length === 0) return stdout;
  return {
    exitCode: 0,
    stdout,
    stderr: warnings.map((warning) => `warning: ${warning}`).join("\n"),
  };
}

function taskAuthor(ctx: PluginCliContext): string {
  return ctx.threadId ? `agent (${ctx.threadId})` : "cli";
}

function groupCommand(
  group: string,
  summary: string,
  subcommands: readonly (readonly [string, string])[],
) {
  const width = Math.max(...subcommands.map(([name]) => name.length));
  return cliCommand({
    summary,
    hidden: true,
    description: [
      "Subcommands:",
      ...subcommands.map(([name, text]) => `  bb tasks ${group} ${name.padEnd(width)}  ${text}`),
    ].join("\n"),
    positionals: [
      {
        name: "subcommand",
        description: `One of: ${subcommands.map(([name]) => name).join(", ")}`,
        variadic: true,
      },
    ],
    options: { json: JSON_OPTION },
    run(input) {
      const [subcommand] = input.positionals.subcommand;
      if (subcommand === undefined) return { exitCode: 1, stdout: input.help };
      throw new CliError(`unknown command: ${group} ${subcommand}`, {
        code: "unknown_command",
        hint: `run bb tasks ${group} --help for its subcommands`,
      });
    },
  });
}

export {
  JSON_OPTION,
  MACHINE_OPTION,
  PROJECT_OPTION,
  REQUIRED_PROJECT_OPTION,
  KEY_POSITIONAL,
  CliError,
  guard,
  withWarnings,
  taskAuthor,
  groupCommand,
};
export type { PluginStatus, TasksDomain };
