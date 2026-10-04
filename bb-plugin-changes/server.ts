import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { rpcContract } from "./contract";
import {
  diffQuery,
  messageOf,
  patchTarget,
  type BranchCommit,
  type ChangesResult,
  type DiffQuery,
  type DiffTarget,
  type PatchesResult,
  type SendFeedbackResult,
} from "./core/changes";

export type { rpcContract } from "./contract";

type Sdk = BbPluginApi["sdk"];

class ChangesUnavailableError extends Error {
  constructor(
    message: string,
    readonly noGit = false,
  ) {
    super(message);
  }
}

async function environmentIdOf(sdk: Sdk, threadId: string): Promise<string> {
  const thread = await sdk.threads.get({ threadId });
  if (thread.environmentId === null) throw new ChangesUnavailableError("This thread has no environment");
  return thread.environmentId;
}

async function baseBranchOf(sdk: Sdk, environmentId: string): Promise<string> {
  const status = await sdk.environments.status({ environmentId });
  if (status.outcome === "not_applicable") throw new ChangesUnavailableError(status.message, true);
  if (status.outcome === "unavailable") throw new ChangesUnavailableError(status.failure.message);
  const defaultBranch = status.workspace.branch.defaultBranch;
  const { remoteBranches } = await sdk.environments.diffBranches({ environmentId });
  // A local default branch is often behind the remote, which would pull merged work into the diff.
  const remoteDefault = `origin/${defaultBranch}`;
  return remoteBranches.includes(remoteDefault) ? remoteDefault : defaultBranch;
}

async function branchCommits(
  sdk: Sdk,
  environmentId: string,
  baseBranch: string,
  warn: (message: string) => void,
): Promise<BranchCommit[]> {
  try {
    const status = await sdk.environments.status({ environmentId, mergeBaseBranch: baseBranch });
    const commits = status.outcome === "available" ? (status.workspace.mergeBase?.commits ?? []) : [];
    return commits.map(({ sha, shortSha, subject }) => ({ sha, shortSha, subject }));
  } catch (error) {
    // bb 0.44 rejects its own merge-base status for some branches; the diff must still load.
    warn(`Branch commits unavailable: ${messageOf(error)}`);
    return [];
  }
}

function failure(error: unknown): { kind: "no_git" } | { kind: "error"; message: string } {
  if (error instanceof ChangesUnavailableError && error.noGit) return { kind: "no_git" };
  return { kind: "error", message: messageOf(error) };
}

async function getChanges(
  sdk: Sdk,
  warn: (message: string) => void,
  threadId: string,
  target: DiffTarget,
): Promise<ChangesResult> {
  try {
    const environmentId = await environmentIdOf(sdk, threadId);
    const baseBranch = await baseBranchOf(sdk, environmentId);
    const query = diffQuery(target, baseBranch);
    const [commits, diff] = await Promise.all([
      branchCommits(sdk, environmentId, baseBranch, warn),
      sdk.environments.diffFiles({ environmentId, ...query }),
    ]);
    if (diff.outcome === "not_applicable") return { kind: "no_git" };
    if (diff.outcome === "unavailable") return { kind: "error", message: diff.failure.message };
    return {
      kind: "ok",
      query,
      files: diff.files.map(({ path, previousPath, additions, deletions, binary, loadMode }) => ({
        path,
        previousPath,
        additions,
        deletions,
        binary,
        loadMode,
      })),
      patches: Object.fromEntries(diff.initialPatches.map(({ path, patch }) => [path, patch])),
      commits,
    };
  } catch (error) {
    return failure(error);
  }
}

async function getPatches(sdk: Sdk, threadId: string, query: DiffQuery, paths: string[]): Promise<PatchesResult> {
  try {
    const environmentId = await environmentIdOf(sdk, threadId);
    const result = await sdk.environments.diffPatch({ environmentId, paths, target: patchTarget(query) });
    if (result.outcome === "not_applicable") return { kind: "error", message: result.message };
    if (result.outcome === "unavailable") return { kind: "error", message: result.failure.message };
    return { kind: "ok", patches: Object.fromEntries(result.patches.map(({ path, patch }) => [path, patch])) };
  } catch (error) {
    return { kind: "error", message: messageOf(error) };
  }
}

async function sendFeedback(sdk: Sdk, threadId: string, text: string): Promise<SendFeedbackResult> {
  try {
    const result = await sdk.threads.send({ threadId, mode: "auto", input: [{ type: "text", text, mentions: [] }] });
    return { kind: "sent", delivery: result.delivery };
  } catch (error) {
    return { kind: "error", message: messageOf(error) };
  }
}

export default async function plugin(bb: BbPluginApi) {
  bb.rpc.register(rpcContract, {
    getChanges: ({ threadId, target }) => getChanges(bb.sdk, (message) => bb.log.warn(message), threadId, target),
    getPatches: ({ threadId, query, paths }) => getPatches(bb.sdk, threadId, query, paths),
    sendFeedback: ({ threadId, text }) => sendFeedback(bb.sdk, threadId, text),
  });
}
