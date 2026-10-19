import { diffQuery, type ChangedFile, type DiffTarget } from "../../core/changes";

export const WORKSPACE_PATH = "bb-plugin-changes/tests/bb-renderer/files/workspace.txt";
export const RENAMED_PATH = "bb-plugin-changes/tests/bb-renderer/files/renamed.txt";
export const DELETED_PATH = "bb-plugin-changes/tests/bb-renderer/files/deleted.txt";
export const WORKSPACE_TEXT = "BBP-215 live workspace content, not historical diff content.";
export const RENAMED_TEXT = "BBP-215 current renamed file, not the previous path.";

export function loopbackOrigin(input: string): string {
  const url = new URL(input);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    input !== url.origin
  ) {
    throw new Error("BB_RENDERER_URL must be a bare loopback HTTP origin");
  }
  return url.origin;
}

export function unsupportedSlotBundle(bundle: string): string {
  const property = "renderCustomHeader:";
  if (bundle.split(property).length !== 2) {
    throw new Error("Expected exactly one compiled renderCustomHeader property");
  }
  return bundle.replace(property, "renderHeaderFilenameSuffix:");
}

function file(
  path: string,
  status: ChangedFile["status"],
  previousPath: string | null = null,
): ChangedFile {
  return {
    path,
    previousPath,
    status,
    additions: 1,
    deletions: 1,
    binary: false,
    loadMode: "auto",
  };
}

function patch(path: string, previousPath = path): string {
  return `diff --git a/${previousPath} b/${path}\n--- a/${previousPath}\n+++ b/${path}\n@@ -1 +1 @@\n-before\n+Historical patch content. This is not the live workspace file.\n`;
}

export function rendererFixture(threadId: string, environmentId: string) {
  const files = [
    file(WORKSPACE_PATH, "modified"),
    file(RENAMED_PATH, "renamed", "bbp-215-previous-name.txt"),
    file(DELETED_PATH, "deleted"),
  ];
  const patches = Object.fromEntries(
    files.map((item) => [item.path, patch(item.path, item.previousPath ?? item.path)]),
  );
  const marks = new Map<string, Record<string, string>>();
  let tabs = {
    revision: 1,
    tabs: [
      { id: "thread-info:thread-info:none", kind: "thread-info" },
      { id: "git-diff:git-diff:none", kind: "git-diff" },
      { id: "new-tab:new-tab:none", kind: "new-tab" },
    ] as unknown[],
  };
  const calls: { method: string; input: Record<string, unknown> }[] = [];
  return {
    calls,
    tabs(method: string, input?: { expectedRevision: number; tabs: unknown[] }) {
      if (method === "GET") return tabs;
      if (method !== "PUT" || input?.expectedRevision !== tabs.revision)
        throw new Error("Unexpected tab write");
      tabs = { revision: tabs.revision + 1, tabs: input.tabs };
      return tabs;
    },
    rpc(method: string, input: Record<string, unknown>): unknown {
      if (input.threadId !== threadId) throw new Error("Unexpected RPC thread");
      calls.push({ method, input });
      const target = input.target as DiffTarget;
      switch (method) {
        case "getChanges":
          return {
            kind: "ok",
            environmentId,
            query: diffQuery(target, "origin/main"),
            files,
            patches,
            commits: [],
          };
        case "getPatches":
          return { kind: "ok", patches };
        case "getViewed":
          return { kind: "ok", marks: marks.get(JSON.stringify(target)) ?? {} };
        case "updateViewed": {
          const key = JSON.stringify(target);
          const next = { ...marks.get(key), ...(input.set as Record<string, string>) };
          for (const path of input.remove as string[]) delete next[path];
          marks.set(key, next);
          return { kind: "ok" };
        }
        default:
          throw new Error(`Unexpected Changes RPC: ${method}`);
      }
    },
  };
}
