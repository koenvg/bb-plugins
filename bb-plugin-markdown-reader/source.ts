import { posix, win32 } from "node:path";
import { Buffer } from "node:buffer";
import { z } from "zod";
import { resolveDestinations, type DocumentLocation } from "./destinations";
import {
  MAX_DESTINATIONS,
  MAX_DESTINATION_URL_LENGTH,
  type DestinationResult,
} from "./destination-types";

export const MAX_DOCUMENT_BYTES = 1024 * 1024;
const id = z.string().min(1).max(256);
export const targetSchema = z
  .object({
    path: z.string().min(1).max(4096),
    source: z
      .object({
        kind: z.enum(["workspace", "host", "thread-storage"]),
        threadId: id.nullable(),
        environmentId: id.nullable(),
        projectId: id.nullable(),
        experimental_hostId: id.optional(),
      })
      .strict(),
  })
  .strict();
export type ReaderTarget = z.infer<typeof targetSchema>;
const snapshotSchema = z.object({
  text: z.string(),
  sha256: z.string(),
  sizeBytes: z.number(),
  target: targetSchema,
  hostId: z.string(),
  rootPath: z.string(),
  documentPath: z.string(),
  documentDirectory: z.string(),
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
  environment(id: string): Promise<{
    id: string;
    projectId: string;
    hostId: string;
    path: string | null;
    status: string;
  }>;
  project(
    id: string,
  ): Promise<{ id: string; sources: { hostId: string; path: string; isDefault: boolean }[] }>;
  thread(id: string): Promise<{ id: string; projectId: string; environmentId: string | null }>;
  storageLocation(threadId: string): Promise<{ hostId: string; storageRootPath: string }>;
  resolveHostRoot(target: { hostId: string; rootPath: string }): Promise<string>;
  read(target: { hostId: string; path: string; rootPath: string }): Promise<{
    content: string;
    contentEncoding: "base64" | "utf8";
    sha256: string;
    sizeBytes: number;
  }>;
  createPreview?(target: {
    hostId: string;
    rootPath: string;
    ttlMs: number;
  }): Promise<{ baseUrl: string; expiresAtMs: number }>;
}
export interface SourceReader {
  read(target: unknown): Promise<ReadResult>;
  destinations(input: unknown): Promise<DestinationResult>;
}
export const destinationsInputSchema = z
  .object({
    target: targetSchema,
    requests: z
      .array(
        z.object({ url: z.string().max(MAX_DESTINATION_URL_LENGTH), image: z.boolean() }).strict(),
      )
      .max(MAX_DESTINATIONS),
  })
  .strict();
const fileTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("workspace"), environmentId: id, path: z.string() }),
  z.object({ kind: z.literal("host"), hostId: id, path: z.string() }),
  z.object({ kind: z.literal("thread-storage"), threadId: id, path: z.string() }),
]);
export const destinationsResultSchema = z.object({
  identity: z
    .object({ hostId: z.string(), rootPath: z.string(), documentPath: z.string() })
    .nullable(),
  destinations: z.array(
    z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("fragment"), fragment: z.string() }),
      z.object({ kind: z.literal("local-file"), target: fileTargetSchema, hostId: z.string() }),
      z.object({ kind: z.literal("external-url"), url: z.string() }),
      z.object({
        kind: z.literal("image"),
        url: z.string(),
        remote: z.boolean(),
        expiresAtMs: z.number().optional(),
      }),
      z.object({ kind: z.literal("rejected"), reason: z.string() }),
    ]),
  ),
});

function hostPaths(path: string) {
  return /^[A-Za-z]:[\\/]|^\\\\/.test(path) ? win32 : posix;
}

/** Literal file paths only. URLs, encoded paths, traversal and device paths are not targets. */
function validDocumentPath(target: ReaderTarget): boolean {
  const { path, source } = target;
  if (!/\.(md|markdown)$/i.test(path) || /[%\x00-\x1f\x7f]/.test(path)) return false;
  if (source.kind !== "host") {
    return !/[\\:]/.test(path) && path.split("/").every((p) => p !== ".." && p !== "." && p !== "");
  }
  const paths = hostPaths(path);
  if (!paths.isAbsolute(path) || /^\\\\[?.]\\/.test(path)) return false;
  const tail = paths === win32 ? path.replace(/^[A-Za-z]:/, "") : path;
  return (
    !tail.includes(":") &&
    (paths === win32 || !path.includes("\\")) &&
    !tail.split(/[\\/]/).some((p) => p === ".." || p === ".")
  );
}

async function resolveSource(adapter: SourceAdapter, target: ReaderTarget) {
  const { kind, threadId, experimental_hostId: selectedHost } = target.source;
  let { environmentId, projectId } = target.source;
  if (threadId) {
    const thread = await adapter.thread(threadId);
    if (
      thread.id !== threadId ||
      (projectId && projectId !== thread.projectId) ||
      (environmentId && environmentId !== thread.environmentId)
    ) {
      throw new Error("The requested thread and source identities do not match.");
    }
    environmentId ??= thread.environmentId;
    projectId ??= thread.projectId;
  }
  if (kind === "thread-storage") {
    if (!threadId)
      throw new Error("No thread identity was supplied for thread storage. Use BB preview.");
    const storage = await adapter.storageLocation(threadId);
    if (selectedHost && selectedHost !== storage.hostId)
      throw new Error("The requested host does not match the thread storage host.");
    return { hostId: storage.hostId, root: storage.storageRootPath };
  }
  if (environmentId) {
    const environment = await adapter.environment(environmentId);
    if (
      environment.id !== environmentId ||
      (projectId && projectId !== environment.projectId) ||
      (selectedHost && selectedHost !== environment.hostId)
    ) {
      throw new Error("The requested source identity does not match its environment.");
    }
    if (kind === "host")
      return { hostId: environment.hostId, root: hostPaths(target.path).dirname(target.path) };
    if (environment.status !== "ready" || !environment.path)
      throw new Error("The workspace is not ready or has no readable root.");
    return { hostId: environment.hostId, root: environment.path, environmentId };
  }
  if (kind === "host") {
    if (threadId || projectId)
      throw new Error(
        "This host source has no environment to verify its thread or project identity.",
      );
    if (!selectedHost) throw new Error("No explicit host identity was supplied. Use BB preview.");
    // No permitted host root exists in the opener contract. Use only this file's directory.
    return { hostId: selectedHost, root: hostPaths(target.path).dirname(target.path) };
  }
  if (!projectId) throw new Error("No workspace identity was supplied. Use BB preview.");
  const project = await adapter.project(projectId);
  if (project.id !== projectId) throw new Error("The requested project does not match.");
  const candidates = project.sources.filter((s) =>
    selectedHost ? s.hostId === selectedHost : s.isDefault,
  );
  if (candidates.length !== 1)
    throw new Error("The workspace root is missing or ambiguous. Use BB preview.");
  return { hostId: candidates[0]!.hostId, root: candidates[0]!.path };
}

async function documentLocation(
  adapter: SourceAdapter,
  target: ReaderTarget,
): Promise<DocumentLocation> {
  if (!validDocumentPath(target))
    throw new Error("Unsupported Markdown file path. Use BB preview.");
  const { hostId, root, ...identity } = await resolveSource(adapter, target);
  const paths = hostPaths(root);
  if (!hostId || !paths.isAbsolute(root))
    throw new Error("The source has no explicit host or absolute root.");
  const rootPath =
    target.source.kind === "host"
      ? await adapter.resolveHostRoot({ hostId, rootPath: paths.normalize(root) })
      : paths.normalize(root);
  if (!paths.isAbsolute(rootPath)) throw new Error("The resolved source root must be absolute.");
  // Resolve the directory only. The SDK still checks the file and any file symlink.
  const documentPath =
    target.source.kind === "host"
      ? paths.join(rootPath, paths.basename(target.path))
      : paths.resolve(rootPath, ...target.path.split("/"));
  const relative = paths.relative(rootPath, documentPath);
  if (relative === ".." || relative.startsWith(`..${paths.sep}`) || paths.isAbsolute(relative))
    throw new Error("The document is outside the source root.");
  return { target, hostId, rootPath, documentPath, ...identity };
}
export function createSourceReader(adapter: SourceAdapter): SourceReader {
  return {
    async read(input) {
      const parsed = targetSchema.safeParse(input);
      if (!parsed.success)
        return {
          kind: "unsupported",
          message: "Invalid file source. Open this file in BB preview.",
        };
      const target = parsed.data;
      if (!validDocumentPath(target))
        return { kind: "unsupported", message: "Unsupported Markdown file path. Use BB preview." };
      try {
        const { hostId, rootPath, documentPath } = await documentLocation(adapter, target);
        const paths = hostPaths(rootPath);
        // The SDK enforces root confinement, including symlinks, on this explicit host.
        // It has no stat or max-byte read option. Oversized content can reach this server.
        const file = await adapter.read({ hostId, rootPath, path: documentPath });
        if (file.sizeBytes > MAX_DOCUMENT_BYTES)
          return {
            kind: "unsupported",
            message: "This file exceeds the 1 MiB reader limit. Use BB preview.",
          };
        if (Buffer.byteLength(file.content, "utf8") > MAX_DOCUMENT_BYTES)
          return {
            kind: "unsupported",
            message: "This file exceeds the 1 MiB reader limit. Use BB preview.",
          };
        if (
          file.contentEncoding !== "utf8" ||
          Buffer.from(file.content, "utf8").toString("utf8") !== file.content
        ) {
          return {
            kind: "unsupported",
            message: "This file is not valid UTF-8 text. Use BB preview.",
          };
        }
        if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(file.content))
          return {
            kind: "unsupported",
            message: "This file contains non-text control characters. Use BB preview.",
          };
        Object.freeze(target.source);
        Object.freeze(target);
        return {
          kind: "ready",
          snapshot: Object.freeze({
            text: file.content,
            sha256: file.sha256,
            sizeBytes: file.sizeBytes,
            target,
            hostId,
            rootPath,
            documentPath,
            documentDirectory: paths.dirname(documentPath),
          }),
        };
      } catch (cause) {
        return {
          kind: "error",
          message:
            cause instanceof Error
              ? cause.message.slice(0, 1024)
              : "Could not read this file. Use BB preview.",
        };
      }
    },
    async destinations(input) {
      const { target, requests } = destinationsInputSchema.parse(input);
      let location: DocumentLocation;
      try {
        location = await documentLocation(adapter, target);
      } catch {
        return {
          identity: null,
          destinations: requests.map(() => ({
            kind: "rejected",
            reason: "The document source is unavailable. Refresh to retry.",
          })),
        };
      }
      const { hostId, rootPath, documentPath } = location;
      return {
        identity: { hostId, rootPath, documentPath },
        destinations: await resolveDestinations(location, requests, adapter.createPreview),
      };
    },
  };
}
