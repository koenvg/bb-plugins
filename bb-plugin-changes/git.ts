import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { posix, win32 } from "node:path";
import { z } from "zod";
import { patchTarget, type DiffQuery, type PatchTarget } from "./core/changes";

type Sdk = BbPluginApi["sdk"];

const notApplicable = z.object({ outcome: z.literal("not_applicable"), message: z.string() });
const unavailable = z.object({
  outcome: z.literal("unavailable"),
  failure: z.object({
    code: z.enum([
      "path_not_found",
      "not_git_repo",
      "workspace_type_mismatch",
      "permission_denied",
      "unknown_environment",
      "unknown",
    ]),
    workspacePath: z.string(),
    message: z.string(),
  }),
});
const commit = z.object({ sha: z.string(), shortSha: z.string(), subject: z.string() });
export const workspaceStatusSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("available"),
    workspace: z.object({
      branch: z.object({ defaultBranch: z.string() }),
      checkout: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("branch"), headSha: z.string().nullable() }),
        z.object({ kind: z.literal("detached"), headSha: z.string().nullable() }),
        z.object({ kind: z.literal("unborn") }),
        z.object({ kind: z.literal("unknown") }),
      ]),
      mergeBase: z.object({ commits: z.array(commit) }).nullable(),
    }),
  }),
  notApplicable,
  unavailable,
]);
const branchesSchema = z.object({
  remoteBranches: z.array(z.string()),
  selectedBranch: z
    .object({ name: z.string(), kind: z.enum(["local", "remote", "missing"]) })
    .nullable(),
});
const patchSchema = z.object({ path: z.string(), patch: z.string(), truncated: z.boolean() });
export const filesSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("available"),
    files: z.array(
      z.object({
        path: z.string(),
        previousPath: z.string().nullable(),
        additions: z.number(),
        deletions: z.number(),
        binary: z.boolean(),
        loadMode: z.enum(["auto", "on_demand", "too_large"]),
        changeKind: z.enum(["added", "modified", "deleted", "renamed", "copied", "type_changed"]),
        origin: z.enum(["tracked", "untracked"]),
        revision: z.string().min(1),
      }),
    ),
    initialPatches: z.array(patchSchema),
    mergeBaseRef: z.string().nullable(),
    truncated: z.boolean(),
    shortstat: z.string(),
  }),
  notApplicable,
  unavailable,
]);
export const patchesSchema = z.record(
  z.string(),
  z.discriminatedUnion("outcome", [
    z.object({ outcome: z.literal("available"), patch: patchSchema }),
    notApplicable,
    unavailable,
  ]),
);
const fileSideSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("available"),
    file: z.object({
      path: z.string(),
      content: z.string(),
      contentEncoding: z.enum(["base64", "utf8"]),
      sizeBytes: z.number(),
    }),
  }),
  z.object({ outcome: z.literal("unavailable"), message: z.string() }),
]);
export type StatusResult = z.infer<typeof workspaceStatusSchema>;
export type FilesResult = z.infer<typeof filesSchema>;
export type PatchResults = z.infer<typeof patchesSchema>;
type FileQuery = { path: string; side: "old" | "new" } & (
  | { target: "uncommitted" }
  | { target: "commit"; sha: string }
);

export function workspaceStatus(
  sdk: Sdk,
  input: { environmentId: string; mergeBaseBranch?: string },
) {
  return sdk.plugins.callRpc<StatusResult>({
    pluginId: "bb--git",
    method: "workspaceStatus",
    input,
    outputSchema: workspaceStatusSchema,
  });
}

export function branches(sdk: Sdk, environmentId: string, selectedBranch: string) {
  return sdk.plugins.callRpc<z.infer<typeof branchesSchema>>({
    pluginId: "bb--git",
    method: "branches",
    input: { environmentId, selectedBranch },
    outputSchema: branchesSchema,
  });
}

export function files(sdk: Sdk, environmentId: string, target: PatchTarget) {
  return sdk.plugins.callRpc<FilesResult>({
    pluginId: "bb--git",
    method: "files",
    input: { environmentId, target, ignoreWhitespace: false },
    outputSchema: filesSchema,
  });
}

export async function patches(sdk: Sdk, environmentId: string, query: DiffQuery, paths: string[]) {
  const target = patchTarget(query);
  const listing = await files(sdk, environmentId, target);
  if (listing.outcome === "not_applicable") throw new Error(listing.message);
  if (listing.outcome === "unavailable") throw new Error(listing.failure.message);
  const revisions = new Map(listing.files.map((file) => [file.path, file.revision]));
  const keys = [...new Set(paths)].map((path) => {
    const revision = revisions.get(path);
    if (revision === undefined) throw new Error(`File changed. Refresh changes: ${path}`);
    return JSON.stringify([environmentId, target, false, path, revision]);
  });
  const result: Record<string, string> = {};
  for (let offset = 0; offset < keys.length; offset += 50) {
    const batch = keys.slice(offset, offset + 50);
    const rows = await sdk.plugins.callRpc<PatchResults>({
      pluginId: "bb--git",
      method: "patches",
      input: { keys: batch },
      outputSchema: patchesSchema,
    });
    for (const key of batch) {
      const row = rows[key];
      if (row === undefined) throw new Error("Patch unavailable. Refresh changes.");
      if (row.outcome === "not_applicable") throw new Error(row.message);
      if (row.outcome === "unavailable") throw new Error(row.failure.message);
      result[row.patch.path] = row.patch.patch;
    }
  }
  return result;
}

export async function fileSide(sdk: Sdk, environmentId: string, query: FileQuery) {
  const result = await sdk.plugins.callRpc<z.infer<typeof fileSideSchema>>({
    pluginId: "bb--git",
    method: "fileSide",
    input: { environmentId, query },
    outputSchema: fileSideSchema,
  });
  if (result.outcome === "unavailable") throw new Error(result.message);
  const file = result.file;
  if (posix.isAbsolute(file.path) || win32.isAbsolute(file.path)) {
    const environment = await sdk.environments.get({ environmentId });
    if (!environment.path) throw new Error("Workspace path unavailable");
    const paths =
      win32.isAbsolute(environment.path) && !posix.isAbsolute(environment.path) ? win32 : posix;
    return {
      ...file,
      path: paths.relative(environment.path, file.path).split(paths.sep).join("/"),
    };
  }
  return file;
}
