import { afterEach, describe, expect, it } from "vitest";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import plugin from "./server";

type Environments = BbPluginApi["sdk"]["environments"];
type StatusResult = Awaited<ReturnType<Environments["status"]>>;
type DiffFilesResult = Awaited<ReturnType<Environments["diffFiles"]>>;
type DiffPatchResult = Awaited<ReturnType<Environments["diffPatch"]>>;
type SendResult = Awaited<ReturnType<BbPluginApi["sdk"]["threads"]["send"]>>;

function status(
  mergeBase: { sha: string; shortSha: string; subject: string }[] | null,
): StatusResult {
  return {
    outcome: "available",
    workspace: {
      branch: { currentBranch: "feature", defaultBranch: "main" },
      mergeBase:
        mergeBase === null
          ? null
          : {
              commits: mergeBase.map((commit) => ({ ...commit, authorName: "Ann", authoredAt: 0 })),
            },
    },
  } as unknown as StatusResult;
}

const COMMIT = { sha: "abc1234def", shortSha: "abc1234", subject: "feat: add a" };

const AVAILABLE_FILES = {
  outcome: "available",
  files: [
    {
      path: "src/a.ts",
      previousPath: null,
      additions: 3,
      deletions: 1,
      binary: false,
      loadMode: "auto",
      changeKind: "modified",
      origin: "tracked",
    },
    {
      path: "logo.png",
      previousPath: null,
      additions: 0,
      deletions: 0,
      binary: true,
      loadMode: "auto",
      changeKind: "added",
      origin: "untracked",
    },
    {
      path: "big.json",
      previousPath: null,
      additions: 9000,
      deletions: 0,
      binary: false,
      loadMode: "too_large",
      changeKind: "added",
      origin: "tracked",
    },
    {
      path: "src/new.ts",
      previousPath: "src/old.ts",
      additions: 2,
      deletions: 2,
      binary: false,
      loadMode: "on_demand",
      changeKind: "renamed",
      origin: "tracked",
    },
  ],
  initialPatches: [{ path: "src/a.ts", patch: "@@ -1 +1 @@\n-a\n+b\n", truncated: false }],
  mergeBaseRef: "main",
  shortstat: "4 files changed",
  truncated: false,
} as DiffFilesResult;

interface Calls {
  status: unknown[];
  diffFiles: unknown[];
  diffPatch: unknown[];
  send: unknown[];
}

let dispose: (() => Promise<void>) | undefined;

afterEach(async () => {
  await dispose?.();
  dispose = undefined;
});

async function setup(
  options: {
    environmentId?: string | null;
    status?: (args: { mergeBaseBranch?: string }) => StatusResult;
    diffFiles?: DiffFilesResult | Error;
    diffPatch?: DiffPatchResult;
    send?: SendResult | Error;
    remoteBranches?: string[];
    kv?: Record<string, unknown>;
  } = {},
) {
  const calls: Calls = { status: [], diffFiles: [], diffPatch: [], send: [] };
  const { bb, harness } = createFakePluginHost({
    pluginId: "changes",
    sdk: {
      threads: {
        get: async ({ threadId }) =>
          makeThreadResponse({
            id: threadId,
            environmentId: options.environmentId === undefined ? "env-1" : options.environmentId,
          }),
        send: async (args) => {
          calls.send.push(args);
          if (options.send instanceof Error) throw options.send;
          return options.send ?? { ok: true as const, delivery: "sent" as const };
        },
      },
      environments: {
        status: async (args) => {
          calls.status.push(args);
          return (
            options.status ??
            ((query) => status(query.mergeBaseBranch === undefined ? null : [COMMIT]))
          )(args);
        },
        diffBranches: async () => ({
          branches: ["main"],
          branchesTruncated: false,
          remoteBranches: options.remoteBranches ?? ["origin/main"],
          remoteBranchesTruncated: false,
          selectedBranch: null,
        }),
        diffFiles: async (args) => {
          calls.diffFiles.push(args);
          if (options.diffFiles instanceof Error) throw options.diffFiles;
          return options.diffFiles ?? AVAILABLE_FILES;
        },
        diffPatch: async (args) => {
          calls.diffPatch.push(args);
          return (
            options.diffPatch ?? {
              outcome: "available",
              patches: [{ path: "src/new.ts", patch: "@@ -1 +1 @@\n-x\n+y\n", truncated: false }],
            }
          );
        },
      },
    },
  });
  for (const [key, value] of Object.entries(options.kv ?? {})) await bb.storage.kv.set(key, value);
  await plugin(bb);
  dispose = () => harness.dispose();
  return { harness, calls, kv: bb.storage.kv };
}

describe("getChanges", () => {
  it.each([
    [{ kind: "all" }, { environmentId: "env-1", target: "all", mergeBaseBranch: "origin/main" }],
    [{ kind: "uncommitted" }, { environmentId: "env-1", target: "uncommitted" }],
    [
      { kind: "branch_committed" },
      { environmentId: "env-1", target: "branch_committed", mergeBaseBranch: "origin/main" },
    ],
    [
      { kind: "commit", sha: "abc1234def" },
      { environmentId: "env-1", target: "commit", sha: "abc1234def" },
    ],
  ])("maps target %j to the environment diff query", async (target, expected) => {
    const { harness, calls } = await setup();

    await harness.callRpc("getChanges", { threadId: "thr_1", target });

    expect(calls.diffFiles).toEqual([expected]);
  });

  it("returns files, initial patches, and branch commits", async () => {
    const { harness } = await setup();

    const result = await harness.callRpc("getChanges", {
      threadId: "thr_1",
      target: { kind: "all" },
    });

    expect(result).toEqual({
      kind: "ok",
      query: { target: "all", mergeBaseBranch: "origin/main" },
      files: [
        {
          path: "src/a.ts",
          previousPath: null,
          additions: 3,
          deletions: 1,
          binary: false,
          loadMode: "auto",
        },
        {
          path: "logo.png",
          previousPath: null,
          additions: 0,
          deletions: 0,
          binary: true,
          loadMode: "auto",
        },
        {
          path: "big.json",
          previousPath: null,
          additions: 9000,
          deletions: 0,
          binary: false,
          loadMode: "too_large",
        },
        {
          path: "src/new.ts",
          previousPath: "src/old.ts",
          additions: 2,
          deletions: 2,
          binary: false,
          loadMode: "on_demand",
        },
      ],
      patches: { "src/a.ts": "@@ -1 +1 @@\n-a\n+b\n" },
      commits: [COMMIT],
    });
  });

  it("compares against the remote default branch", async () => {
    const { harness, calls } = await setup();

    await harness.callRpc("getChanges", { threadId: "thr_1", target: { kind: "all" } });

    expect(calls.status).toEqual([
      { environmentId: "env-1" },
      { environmentId: "env-1", mergeBaseBranch: "origin/main" },
    ]);
  });

  it("falls back to the local default branch without a remote one", async () => {
    const { harness, calls } = await setup({ remoteBranches: [] });

    await harness.callRpc("getChanges", { threadId: "thr_1", target: { kind: "all" } });

    expect(calls.diffFiles).toEqual([
      { environmentId: "env-1", target: "all", mergeBaseBranch: "main" },
    ]);
  });

  it("still returns the diff when bb fails to list the branch commits", async () => {
    const { harness } = await setup({
      status: (query) => {
        if (query.mergeBaseBranch !== undefined) throw new Error("HTTP 502: invalid commits");
        return status(null);
      },
    });

    const result = await harness.callRpc("getChanges", {
      threadId: "thr_1",
      target: { kind: "all" },
    });

    expect(result).toMatchObject({ kind: "ok", commits: [] });
  });

  it("reports a thread without an environment as an error", async () => {
    const { harness } = await setup({ environmentId: null });

    const result = await harness.callRpc("getChanges", {
      threadId: "thr_1",
      target: { kind: "all" },
    });

    expect(result).toEqual({ kind: "error", message: "This thread has no environment" });
  });

  it("reports a non-git environment as no_git", async () => {
    const { harness } = await setup({
      status: () =>
        ({
          outcome: "not_applicable",
          reason: "non_git_environment",
          message: "Not a git environment",
        }) as StatusResult,
    });

    const result = await harness.callRpc("getChanges", {
      threadId: "thr_1",
      target: { kind: "all" },
    });

    expect(result).toEqual({ kind: "no_git" });
  });

  it("keeps the message of an unavailable diff", async () => {
    const { harness } = await setup({
      diffFiles: {
        outcome: "unavailable",
        failure: { code: "permission_denied", message: "permission denied", workspacePath: "/w" },
      },
    });

    const result = await harness.callRpc("getChanges", {
      threadId: "thr_1",
      target: { kind: "all" },
    });

    expect(result).toEqual({ kind: "error", message: "permission denied" });
  });

  it("returns a thrown error as an error result", async () => {
    const { harness } = await setup({ diffFiles: new Error("daemon gone") });

    const result = await harness.callRpc("getChanges", {
      threadId: "thr_1",
      target: { kind: "all" },
    });

    expect(result).toEqual({ kind: "error", message: "daemon gone" });
  });
});

describe("getPatches", () => {
  it.each([
    [
      { target: "all", mergeBaseBranch: "origin/main" },
      { type: "all", mergeBaseBranch: "origin/main" },
    ],
    [{ target: "uncommitted" }, { type: "uncommitted" }],
    [
      { target: "commit", sha: "abc1234def" },
      { type: "commit", sha: "abc1234def" },
    ],
  ])("asks for the patches of the requested paths with query %j", async (query, target) => {
    const { harness, calls } = await setup();

    await harness.callRpc("getPatches", { threadId: "thr_1", query, paths: ["src/new.ts"] });

    expect(calls.diffPatch).toEqual([{ environmentId: "env-1", paths: ["src/new.ts"], target }]);
    expect(calls.status).toEqual([]);
  });

  it("returns the patches per path", async () => {
    const { harness } = await setup();

    const result = await harness.callRpc("getPatches", {
      threadId: "thr_1",
      query: { target: "uncommitted" },
      paths: ["src/new.ts"],
    });

    expect(result).toEqual({ kind: "ok", patches: { "src/new.ts": "@@ -1 +1 @@\n-x\n+y\n" } });
  });
});

describe("sendFeedback", () => {
  it.each(["sent", "queued"] as const)("returns the %s delivery", async (delivery) => {
    const { harness, calls } = await setup({ send: { ok: true, delivery } as SendResult });

    const result = await harness.callRpc("sendFeedback", { threadId: "thr_1", text: "Fix it" });

    expect(result).toEqual({ kind: "sent", delivery });
    expect(calls.send).toEqual([
      { threadId: "thr_1", mode: "auto", input: [{ type: "text", text: "Fix it", mentions: [] }] },
    ]);
  });

  it("rejects blank text", async () => {
    const { harness, calls } = await setup();

    await expect(
      harness.callRpc("sendFeedback", { threadId: "thr_1", text: "  " }),
    ).rejects.toThrow();
    expect(calls.send).toEqual([]);
  });

  it("returns a thrown error as an error result", async () => {
    const { harness } = await setup({ send: new Error("thread archived") });

    const result = await harness.callRpc("sendFeedback", { threadId: "thr_1", text: "Fix it" });

    expect(result).toEqual({ kind: "error", message: "thread archived" });
  });
});

describe("viewed marks", () => {
  const ALL = { kind: "all" } as const;
  const KEY = "viewed:v1:thr_1:all";

  it("reads the marks of a thread and target", async () => {
    const { harness } = await setup({
      kv: {
        [KEY]: { v: 1, marks: { "src/a.ts": "5:aaaa" } },
        "viewed:v1:thr_1:uncommitted": { v: 1, marks: { "src/b.ts": "5:bbbb" } },
      },
    });

    const result = await harness.callRpc("getViewed", { threadId: "thr_1", target: ALL });

    expect(result).toEqual({ kind: "ok", marks: { "src/a.ts": "5:aaaa" } });
  });

  it("reads a bad stored value as no marks", async () => {
    const { harness } = await setup({ kv: { [KEY]: { v: 2, marks: "?" } } });

    const result = await harness.callRpc("getViewed", { threadId: "thr_1", target: ALL });

    expect(result).toEqual({ kind: "ok", marks: {} });
  });

  it("sets and removes marks in one update, per commit sha", async () => {
    const commit = { kind: "commit", sha: "abc1234def" } as const;
    const { harness, kv } = await setup({
      kv: {
        "viewed:v1:thr_1:commit:abc1234def": {
          v: 1,
          marks: { "src/a.ts": "5:aaaa", "src/b.ts": "5:bbbb" },
        },
      },
    });

    const result = await harness.callRpc("updateViewed", {
      threadId: "thr_1",
      target: commit,
      set: { "src/c.ts": "5:cccc" },
      remove: ["src/a.ts"],
    });

    expect(result).toEqual({ kind: "ok" });
    expect(await kv.get("viewed:v1:thr_1:commit:abc1234def")).toEqual({
      v: 1,
      marks: { "src/b.ts": "5:bbbb", "src/c.ts": "5:cccc" },
    });
  });

  it("deletes the key when no marks are left", async () => {
    const { harness, kv } = await setup({
      kv: { [KEY]: { v: 1, marks: { "src/a.ts": "5:aaaa" } } },
    });

    await harness.callRpc("updateViewed", {
      threadId: "thr_1",
      target: ALL,
      set: {},
      remove: ["src/a.ts"],
    });

    expect(await kv.list("viewed:")).toEqual([]);
  });

  it("keeps both changes of two parallel updates", async () => {
    const { harness, kv } = await setup();

    await Promise.all([
      harness.callRpc("updateViewed", {
        threadId: "thr_1",
        target: ALL,
        set: { "src/a.ts": "5:aaaa" },
        remove: [],
      }),
      harness.callRpc("updateViewed", {
        threadId: "thr_1",
        target: ALL,
        set: { "src/b.ts": "5:bbbb" },
        remove: [],
      }),
    ]);

    expect(await kv.get(KEY)).toEqual({
      v: 1,
      marks: { "src/a.ts": "5:aaaa", "src/b.ts": "5:bbbb" },
    });
  });

  it("returns a storage error as an error result", async () => {
    const { harness, kv } = await setup();
    kv.set = async () => {
      throw new Error("disk full");
    };

    const result = await harness.callRpc("updateViewed", {
      threadId: "thr_1",
      target: ALL,
      set: { "src/a.ts": "5:aaaa" },
      remove: [],
    });

    expect(result).toEqual({ kind: "error", message: "disk full" });
  });
});
