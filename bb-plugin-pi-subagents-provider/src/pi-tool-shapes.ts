import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import {
  bashArgsSchema,
  toOptionalString,
  type DeltaItemShape,
} from "@get-bb/plugin-sdk-runtime/provider-bridge";

export const PI_COMMAND_TOOL_NAMES = new Set(["bash"]);
const PI_FILE_CHANGE_TOOL_NAMES = new Set(["edit", "write"]);
const PI_IMAGE_READ_PATH_PATTERN = /\.(?:png|jpe?g|gif|webp|bmp)$/i;
const PI_UNICODE_SPACE_PATTERN = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;
const URL_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:\/\//i;

const piReadArgsSchema = z.object({
  path: z.string().refine((path) => path.trim().length > 0),
});

const piImageContentBlockSchema = z.object({
  type: z.literal("image"),
  data: z.string().trim().min(1),
  mimeType: z.string().regex(/^image\/[^\s/]+$/),
});

const piToolResultContentSchema = z.object({
  content: z.array(z.unknown()),
});

export function hasPiImageContent(result: unknown): boolean {
  const parsed = piToolResultContentSchema.safeParse(result);
  return (
    parsed.success &&
    parsed.data.content.some((block) => piImageContentBlockSchema.safeParse(block).success)
  );
}

const piFileEditArgsSchema = z
  .object({
    path: z.string().optional(),
    oldText: z.string().optional(),
    newText: z.string().optional(),
    content: z.string().optional(),
    edits: z.unknown().optional(),
  })
  .passthrough();

const piFileEditBatchSchema = z.array(
  z.object({
    oldText: z.string(),
    newText: z.string(),
  }),
);

export function classifyPiToolUse(
  toolName: string,
  args: unknown,
  sessionCwd: string | undefined,
): DeltaItemShape {
  if (PI_COMMAND_TOOL_NAMES.has(toolName)) {
    const parsed = bashArgsSchema.safeParse(args);
    const command = parsed.success ? toOptionalString(parsed.data.command) : undefined;
    const cwd =
      (parsed.success ? toOptionalString(parsed.data.cwd) : undefined) ??
      toOptionalString(sessionCwd);
    if (!command || !cwd) {
      return { type: "tool", tool: toolName, args };
    }
    return { type: "command", command, cwd };
  }

  if (PI_FILE_CHANGE_TOOL_NAMES.has(toolName)) {
    const parsed = piFileEditArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { type: "tool", tool: toolName, args };
    }
    if (!parsed.data.path) {
      return { type: "tool", tool: toolName, args: parsed.data };
    }
    const path = parsed.data.path;
    const parsedEdits = piFileEditBatchSchema.safeParse(parsed.data.edits);
    if (parsedEdits.success && parsedEdits.data.length > 0) {
      return {
        type: "fileChange",
        changes: parsedEdits.data.map((edit) => ({
          path,
          kind: "update",
          oldText: edit.oldText,
          newText: edit.newText,
        })),
      };
    }

    const newText = parsed.data.newText ?? parsed.data.content;
    return {
      type: "fileChange",
      changes: [
        {
          path,
          kind: toolName === "edit" || parsed.data.oldText !== undefined ? "update" : "add",
          ...(parsed.data.oldText === undefined ? {} : { oldText: parsed.data.oldText }),
          ...(newText === undefined ? {} : { newText }),
        },
      ],
    };
  }

  return { type: "tool", tool: toolName, args };
}

export function resolvePiImageReadPath(
  toolName: string,
  args: unknown,
  sessionCwd: string | undefined,
): string | null {
  if (toolName !== "read") {
    return null;
  }
  const parsed = piReadArgsSchema.safeParse(args);
  if (!parsed.success) {
    return null;
  }
  let path = parsed.data.path.replace(PI_UNICODE_SPACE_PATTERN, " ");
  if (path.startsWith("@")) {
    path = path.slice(1);
  }
  if (path === "~" || path.startsWith("~/")) {
    path = join(homedir(), path.slice(2));
  }
  if (URL_SCHEME_PATTERN.test(path)) {
    return null;
  }
  const absolutePath = isAbsolute(path)
    ? resolve(path)
    : sessionCwd !== undefined && isAbsolute(sessionCwd)
      ? resolve(sessionCwd, path)
      : null;
  return absolutePath !== null && PI_IMAGE_READ_PATH_PATTERN.test(absolutePath)
    ? absolutePath
    : null;
}

export function classifyPiToolResultFallback(toolName: string): DeltaItemShape {
  if (PI_FILE_CHANGE_TOOL_NAMES.has(toolName)) {
    return { type: "fileChange", changes: [] };
  }
  return { type: "tool", tool: toolName };
}
