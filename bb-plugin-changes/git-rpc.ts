import { z } from "zod";
import { branchCommitSchema, changedFileSchema } from "./core/changes";

const notApplicable = z.object({
  outcome: z.literal("not_applicable"),
  reason: z.literal("non_git_environment"),
  message: z.string(),
});
const unavailable = z.object({
  outcome: z.literal("unavailable"),
  failure: z.object({ code: z.string(), workspacePath: z.string(), message: z.string() }),
});

export const gitStatusSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("available"),
    workspace: z.object({
      branch: z.object({ currentBranch: z.string().nullable(), defaultBranch: z.string() }),
      checkout: z.discriminatedUnion("kind", [
        z.object({
          kind: z.literal("branch"),
          branchName: z.string(),
          headSha: z.string().nullable(),
        }),
        z.object({ kind: z.literal("detached"), headSha: z.string().nullable() }),
        z.object({ kind: z.literal("unborn") }),
        z.object({ kind: z.literal("unknown") }),
      ]),
      mergeBase: z.object({ commits: z.array(branchCommitSchema) }).nullable(),
    }),
  }),
  notApplicable,
  unavailable,
]);
export type GitStatus = z.infer<typeof gitStatusSchema>;

export const gitBranchesSchema = z.object({ remoteBranches: z.array(z.string()) });

const patchSchema = z.object({ path: z.string(), patch: z.string(), truncated: z.boolean() });
const { status: changeStatus, ...fileShape } = changedFileSchema.shape;
export const gitFilesSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("available"),
    files: z.array(
      z.object({
        ...fileShape,
        changeKind: changeStatus.exclude(["untracked"]),
        origin: z.enum(["tracked", "untracked"]),
        revision: z.string().min(1),
      }),
    ),
    initialPatches: z.array(patchSchema),
    mergeBaseRef: z.string().nullable(),
    shortstat: z.string(),
    truncated: z.boolean(),
  }),
  notApplicable,
  unavailable,
]);
export type GitFiles = z.infer<typeof gitFilesSchema>;

export const gitPatchesSchema = z.record(
  z.string(),
  z.discriminatedUnion("outcome", [
    z.object({ outcome: z.literal("available"), patch: patchSchema }),
    notApplicable,
    unavailable,
  ]),
);
export type GitPatches = z.infer<typeof gitPatchesSchema>;

export const gitFileSideSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("available"),
    file: z.object({
      path: z.string(),
      content: z.string(),
      contentEncoding: z.enum(["base64", "utf8"]),
      sizeBytes: z.number().int().nonnegative(),
      mimeType: z.string().optional(),
    }),
  }),
  z.object({
    outcome: z.literal("unavailable"),
    code: z.enum(["ENOENT", "invalid_path", "file_too_large"]),
    message: z.string(),
  }),
]);
export type GitFileSide = z.infer<typeof gitFileSideSchema>;
