import { posix, win32 } from "node:path";
import { Buffer } from "node:buffer";
import { z } from "zod";

export const MAX_DOCUMENT_BYTES = 1024 * 1024;
const id = z.string().min(1).max(256);
export const targetSchema = z.object({
  path: z.string().min(1).max(4096),
  source: z.object({
    kind: z.enum(["workspace", "host", "thread-storage"]),
    threadId: id.nullable(), environmentId: id.nullable(), projectId: id.nullable(),
    experimental_hostId: id.optional(),
  }).strict(),
}).strict();
export type ReaderTarget = z.infer<typeof targetSchema>;
const snapshotSchema = z.object({
  text: z.string(), sha256: z.string(), sizeBytes: z.number(), target: targetSchema,
  hostId: z.string(), rootPath: z.string(), documentPath: z.string(), documentDirectory: z.string(),
});
export const readResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ready"), snapshot: snapshotSchema }),
  z.object({ kind: z.literal("error"), message: z.string() }),
  z.object({ kind: z.literal("unsupported"), message: z.string() }),
]);
export type TextSnapshot = Readonly<z.infer<typeof snapshotSchema>>;
export type ReadResult =
  | { kind: "ready"; snapshot: TextSnapshot }
  | { kind: "error" | "unsupported"; message: string };

/** Only the source module knows how roots and hosts are selected. No writes. */
export interface SourceAdapter {
  environment(id: string): Promise<{ id: string; projectId: string; hostId: string; path: string | null; status: string }>;
  project(id: string): Promise<{ id: string; sources: { hostId: string; path: string; isDefault: boolean }[] }>;
  thread(id: string): Promise<{ id: string; projectId: string; environmentId: string | null }>;
  read(target: { hostId: string; path: string; rootPath: string }): Promise<{
    content: string; contentEncoding: "base64" | "utf8"; sha256: string; sizeBytes: number;
  }>;
}
export interface SourceReader { read(target: unknown): Promise<ReadResult> }

export function createSourceReader(adapter: SourceAdapter): SourceReader {
  return {
    async read(input) {
      const parsed = targetSchema.safeParse(input);
      if (!parsed.success) return { kind: "unsupported", message: "Invalid file source. Open this file in BB preview." };
      const target = parsed.data;
      if (target.source.kind !== "workspace") return { kind: "unsupported", message: "This reader currently supports workspace files only. Use BB preview for this source." };
      // Treat paths as literal workspace paths, not URLs or server-local paths.
      const parts = target.path.split("/");
      if (!/\.(md|markdown)$/i.test(target.path) || /[\\%\x00-\x1f\x7f:]/.test(target.path) || parts.some(p => p === ".." || p === "")) {
        return { kind: "unsupported", message: "Unsupported workspace Markdown path. Use BB preview." };
      }
      try {
        let { environmentId, projectId, threadId, experimental_hostId: selectedHost } = target.source;
        if (threadId) {
          const thread = await adapter.thread(threadId);
          if (thread.id !== threadId || (projectId && projectId !== thread.projectId) || (environmentId && environmentId !== thread.environmentId)) throw new Error("The requested thread and workspace do not match.");
          environmentId ??= thread.environmentId;
          projectId ??= thread.projectId;
        }
        let hostId: string;
        let root: string;
        if (environmentId) {
          const environment = await adapter.environment(environmentId);
          if (environment.id !== environmentId || (projectId && projectId !== environment.projectId) || (selectedHost && selectedHost !== environment.hostId)) throw new Error("The requested workspace identity does not match its environment.");
          if (environment.status !== "ready" || !environment.path) throw new Error("The workspace is not ready or has no readable root.");
          hostId = environment.hostId;
          root = environment.path;
        } else {
          if (!projectId) throw new Error("No workspace identity was supplied. Use BB preview.");
          const project = await adapter.project(projectId);
          if (project.id !== projectId) throw new Error("The requested project does not match.");
          const candidates = project.sources.filter(s => selectedHost ? s.hostId === selectedHost : s.isDefault);
          if (candidates.length !== 1) throw new Error("The workspace root is missing or ambiguous. Use BB preview.");
          hostId = candidates[0]!.hostId;
          root = candidates[0]!.path;
        }
        const paths = /^[A-Za-z]:[\\/]|^\\\\/.test(root) ? win32 : posix;
        if (!hostId || !paths.isAbsolute(root)) throw new Error("The workspace has no explicit host or absolute root.");
        const rootPath = paths.normalize(root);
        const documentPath = paths.resolve(rootPath, ...parts);
        const relative = paths.relative(rootPath, documentPath);
        if (relative === ".." || relative.startsWith(`..${paths.sep}`) || paths.isAbsolute(relative)) throw new Error("The document is outside the workspace root.");
        // The SDK enforces root confinement, including symlinks, on the selected host.
        // It has no stat or max-byte read option. Reject oversized responses before parsing.
        const file = await adapter.read({ hostId, rootPath, path: documentPath });
        if (file.sizeBytes > MAX_DOCUMENT_BYTES) return { kind: "unsupported", message: "This file exceeds the 1 MiB reader limit. Use BB preview." };
        if (file.contentEncoding !== "utf8" || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(file.content)) return { kind: "unsupported", message: "This file is not supported UTF-8 text. Use BB preview." };
        if (Buffer.byteLength(file.content, "utf8") > MAX_DOCUMENT_BYTES) return { kind: "unsupported", message: "This file exceeds the 1 MiB reader limit. Use BB preview." };
        Object.freeze(target.source);
        Object.freeze(target);
        return { kind: "ready", snapshot: Object.freeze({
          text: file.content, sha256: file.sha256, sizeBytes: file.sizeBytes, target,
          hostId, rootPath, documentPath, documentDirectory: paths.dirname(documentPath),
        }) };
      } catch (cause) {
        return { kind: "error", message: cause instanceof Error ? cause.message : "Could not read this workspace file. Use BB preview." };
      }
    },
  };
}
