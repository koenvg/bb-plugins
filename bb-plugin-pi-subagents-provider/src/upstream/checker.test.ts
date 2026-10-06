import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { checkUpstream, runOutput, type Transport } from "./checker.ts";

const base = "a".repeat(40);
const head = "b".repeat(40);
const baseline = {
  schemaVersion: 1,
  repository: "https://github.com/get-bb/bb.git",
  branch: "main",
  revision: base,
  sourcePath: "plugins/provider-pi",
  watchedContractPaths: ["packages/plugin-sdk", "docs/provider-plugin-api.md"],
};

function fixture(paths: string[], before: string[] = []): Transport {
  const oldTree = gitTree(before, "before");
  const newTree = gitTree(paths, "after");
  return async (path) => {
    if (path.includes("/branches/"))
      return { status: 200, data: { commit: { sha: head } }, next: false };
    if (path.includes("/compare/"))
      return {
        status: 200,
        next: false,
        data: {
          status: "ahead",
          base_commit: { sha: base },
          merge_base_commit: { sha: base },
          total_commits: 1,
          ahead_by: 1,
          commits: [{ sha: head }],
        },
      };
    if (path.includes("/git/trees/")) {
      const tree = path.includes(oldTree.sha) ? oldTree : newTree;
      return { status: 200, next: false, data: tree };
    }
    const old = path.includes(base);
    const page = Number(new URL(path, "https://example.test").searchParams.get("page"));
    const files = old
      ? []
      : paths
          .slice((page - 1) * 100, page * 100)
          .map((filename) => ({ filename, status: "modified" }));
    return {
      status: 200,
      next: !old && paths.length > page * 100,
      data: {
        sha: old ? base : head,
        parents: [{ sha: base }],
        commit: { tree: { sha: old ? oldTree.sha : newTree.sha } },
        files,
      },
    };
  };
}
const treeFixtures = new Map<
  string,
  {
    sha: string;
    truncated: false;
    tree: { path: string; type: string; mode: string; sha: string }[];
  }
>();
// Git generates fixture trees independently. No checker implementation builds its own expected data.
function gitTree(paths: string[], content: string) {
  const key = JSON.stringify([paths, content]);
  const cached = treeFixtures.get(key);
  if (cached) return cached;
  const root = mkdtempSync(join(tmpdir(), "bbp76-tree-fixture-"));
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        HOME: root,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
      },
    });
  try {
    git("init", "-q", "--object-format=sha1");
    for (const path of paths) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    git("add", ".");
    const sha = git("write-tree").trim();
    const tree = git("ls-tree", "-r", "-t", "-z", sha)
      .split("\0")
      .filter(Boolean)
      .map((row) => {
        const [metadata, path] = row.split("\t");
        const [mode, type, sha] = metadata.split(" ");
        return { path, type, mode, sha };
      });
    const data = { sha, truncated: false as const, tree };
    treeFixtures.set(key, data);
    return data;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("read-only upstream comparison", () => {
  it("reports provider changes with incorporated baseline and pinned head", async () => {
    const result = await checkUpstream(baseline, {
      transport: fixture(["plugins/provider-pi/src/bridge.ts"]),
      now: () => 0,
    });
    expect(result).toEqual({
      status: "review-required",
      baseline: base,
      head,
      changes: [{ commit: head, paths: ["plugins/provider-pi/src/bridge.ts"] }],
    });
  });
  it("reports contract-only changes and excludes path-prefix lookalikes", async () => {
    const result = await checkUpstream(baseline, {
      transport: fixture(["packages/plugin-sdk/api.ts", "plugins/provider-pi-other/a.ts"]),
      now: () => 0,
    });
    expect(result).toMatchObject({
      status: "review-required",
      changes: [{ commit: head, paths: ["packages/plugin-sdk/api.ts"] }],
    });
  });

  it("keeps a complete irrelevant comparison silent", async () => {
    const result = await checkUpstream(baseline, {
      transport: fixture(["other/file.ts"]),
      now: () => 0,
    });
    expect(runOutput(result)).toEqual({ exitCode: 0, stdout: "", stderr: "" });
  });

  it.each([
    undefined,
    {},
    { ...baseline, revision: "bad" },
    { ...baseline, watchedContractPaths: [] },
  ])("fails visibly for invalid baseline %j", async (input) => {
    const transport = vi.fn(fixture([]));
    const result = await checkUpstream(input, { transport, now: () => 0 });
    expect(runOutput(result)).toMatchObject({ exitCode: 1, stdout: "" });
    expect(runOutput(result).stderr).toContain("inconclusive");
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([403, 404, 429, 500])("fails visibly for upstream HTTP %s", async (status) => {
    const result = await checkUpstream(baseline, {
      transport: async () => ({ status, data: { token: "secret" }, next: false }),
      now: () => 0,
    });
    expect(runOutput(result).exitCode).toBe(1);
    expect(runOutput(result).stderr).not.toContain("secret");
  });

  it("does not print transport errors or credentials", async () => {
    const result = await checkUpstream(baseline, {
      transport: async () => {
        throw new Error("token=secret");
      },
      now: () => 0,
    });
    expect(runOutput(result).stderr).toContain("inconclusive");
    expect(runOutput(result).stderr).not.toContain("secret");
  });

  it.each(["behind", "diverged"])("rejects %s or rewritten history", async (status) => {
    const normal = fixture([]);
    const result = await checkUpstream(baseline, {
      now: () => 0,
      transport: async (p, s) => {
        const r = await normal(p, s);
        return p.includes("compare")
          ? {
              ...r,
              data: { ...(r.data as object), status, merge_base_commit: { sha: "c".repeat(40) } },
            }
          : r;
      },
    });
    expect(result).toMatchObject({ status: "inconclusive", baseline: base, head });
  });

  it.each([
    { total_commits: 2, ahead_by: 2 },
    { commits: [] },
    { commits: [{ sha: head }, { sha: head }] },
    { total_commits: 2001, ahead_by: 2001 },
  ])("rejects incomplete commit lists %j", async (patch) => {
    const normal = fixture([]);
    const result = await checkUpstream(baseline, {
      now: () => 0,
      transport: async (p, s) => {
        const r = await normal(p, s);
        return p.includes("compare") ? { ...r, data: { ...(r.data as object), ...patch } } : r;
      },
    });
    expect(result.status).toBe("inconclusive");
  });

  it("checks renamed paths leaving a watched directory", async () => {
    const normal = fixture(["other/moved.ts"], ["plugins/provider-pi/a.ts"]);
    const result = await checkUpstream(baseline, {
      now: () => 0,
      transport: async (p, s) =>
        p.includes(`/commits/${head}`)
          ? {
              ...(await normal(p, s)),
              data: {
                ...((await normal(p, s)).data as object),
                files: [
                  {
                    filename: "other/moved.ts",
                    status: "renamed",
                    previous_filename: "plugins/provider-pi/a.ts",
                  },
                ],
              },
            }
          : normal(p, s),
    });
    expect(result).toMatchObject({
      status: "review-required",
      changes: [{ paths: ["plugins/provider-pi/a.ts"] }],
    });
  });

  it("requires full file pagination before silent success", async () => {
    const normal = fixture([
      ...Array.from({ length: 100 }, (_, i) => `other/${i}`),
      "packages/plugin-sdk/api.ts",
    ]);
    const result = await checkUpstream(baseline, { now: () => 0, transport: normal });
    expect(result).toMatchObject({
      status: "review-required",
      changes: [{ paths: ["packages/plugin-sdk/api.ts"] }],
    });
  });

  it("fails on missing file pages, duplicate files, and exhausted bounds", async () => {
    for (const mode of ["missing", "duplicate", "bound"]) {
      const normal = fixture([]);
      const result = await checkUpstream(baseline, {
        now: () => 0,
        bounds: mode === "bound" ? { pages: 1 } : {},
        transport: async (p, s) => {
          if (!p.includes("/commits/")) return normal(p, s);
          const last = p.endsWith("page=2");
          return {
            status: 200,
            next: mode !== "missing" && !last,
            data: {
              sha: head,
              files: last
                ? [{ filename: "other/0", status: "modified" }]
                : Array.from({ length: 100 }, (_, i) => ({
                    filename: `other/${i}`,
                    status: "modified",
                  })),
            },
          };
        },
      });
      expect(result.status).toBe("inconclusive");
    }
  });

  it("bounds requests, elapsed time, and stalled requests", async () => {
    expect(
      (
        await checkUpstream(baseline, {
          transport: fixture([]),
          now: () => 0,
          bounds: { requests: 1 },
        })
      ).status,
    ).toBe("inconclusive");
    let time = 0;
    expect(
      (await checkUpstream(baseline, { transport: fixture([]), now: () => (time += 90_000) }))
        .status,
    ).toBe("inconclusive");
    expect(
      (
        await checkUpstream(baseline, {
          transport: () => new Promise(() => {}),
          now: () => 0,
          bounds: { requestMs: 1 },
        })
      ).status,
    ).toBe("inconclusive");
  });
  it("does not accept a file list that omits changed paths", async () => {
    const normal = fixture(["plugins/provider-pi/a.ts"]);
    const result = await checkUpstream(baseline, {
      now: () => 0,
      transport: async (p, s) => {
        const r = await normal(p, s);
        return p.includes(`/commits/${head}`)
          ? { ...r, data: { ...(r.data as object), files: [] } }
          : r;
      },
    });
    expect(result).toMatchObject({
      status: "inconclusive",
      reason: "Commit file list disagrees with complete trees",
    });
  });
  it("reads every comparison commit page before silent success", async () => {
    const ids = [
      ...Array.from({ length: 100 }, (_, i) => (i + 1).toString(16).padStart(40, "0")),
      head,
    ];
    const transport: Transport = async (p) => {
      if (p.includes("branches"))
        return { status: 200, next: false, data: { commit: { sha: head } } };
      if (p.includes("compare")) {
        const last = p.endsWith("page=2");
        return {
          status: 200,
          next: !last,
          data: {
            status: "ahead",
            base_commit: { sha: base },
            merge_base_commit: { sha: base },
            total_commits: 101,
            ahead_by: 101,
            commits: (last ? ids.slice(100) : ids.slice(0, 100)).map((sha) => ({ sha })),
          },
        };
      }
      if (p.includes("git/trees"))
        return {
          status: 200,
          next: false,
          data: { sha: "4b825dc642cb6eb9a060e54bf8d69288fbee4904", truncated: false, tree: [] },
        };
      const commit = p.split("/commits/")[1].split("?")[0];
      return {
        status: 200,
        next: false,
        data: {
          sha: commit,
          parents: [{ sha: base }],
          commit: { tree: { sha: "4b825dc642cb6eb9a060e54bf8d69288fbee4904" } },
          files: [],
        },
      };
    };
    expect((await checkUpstream(baseline, { transport, now: () => 0 })).status).toBe(
      "no-relevant-change",
    );
    expect(
      (await checkUpstream(baseline, { transport, now: () => 0, bounds: { pages: 1 } })).status,
    ).toBe("inconclusive");
  });

  it("rejects truncated or unavailable complete trees", async () => {
    const normal = fixture(["other/file.ts"]);
    for (const patch of [{ truncated: true }, { tree: undefined }, { sha: "bad" }]) {
      const result = await checkUpstream(baseline, {
        now: () => 0,
        transport: async (p, s) => {
          const r = await normal(p, s);
          return p.includes("git/trees") ? { ...r, data: { ...(r.data as object), ...patch } } : r;
        },
      });
      expect(result.status).toBe("inconclusive");
    }
  });
  it("rejects missing paths even when file and tree omissions agree", async () => {
    const normal = fixture(["plugins/provider-pi/a.ts"]);
    const result = await checkUpstream(baseline, {
      now: () => 0,
      transport: async (p, s) => {
        const r = await normal(p, s);
        if (p.includes(`/commits/${head}`))
          return { ...r, data: { ...(r.data as object), files: [] } };
        if (p.includes("git/trees")) return { ...r, data: { ...(r.data as object), tree: [] } };
        return r;
      },
    });
    expect(result.status).toBe("inconclusive");
  });
  it("accepts an exact full last file page only after independent tree coverage", async () => {
    const result = await checkUpstream(baseline, {
      now: () => 0,
      transport: fixture(Array.from({ length: 100 }, (_, i) => `other/${i}`)),
    });
    expect(result.status).toBe("no-relevant-change");
  });

  it("reports relevant commits even when a later commit reverts their paths", async () => {
    const final = "c".repeat(40);
    const file = "plugins/provider-pi/changed.ts";
    const empty = gitTree([], "empty");
    const changed = gitTree([file], "changed");
    const transport: Transport = async (p) => {
      if (p.includes("branches"))
        return { status: 200, next: false, data: { commit: { sha: final } } };
      if (p.includes("compare"))
        return {
          status: 200,
          next: false,
          data: {
            status: "ahead",
            base_commit: { sha: base },
            merge_base_commit: { sha: base },
            total_commits: 2,
            ahead_by: 2,
            commits: [{ sha: head }, { sha: final }],
          },
        };
      if (p.includes("git/trees"))
        return { status: 200, next: false, data: p.includes(changed.sha) ? changed : empty };
      const revision = p.includes(head) ? head : p.includes(final) ? final : base;
      return {
        status: 200,
        next: false,
        data: {
          sha: revision,
          parents: [{ sha: revision === final ? head : base }],
          commit: { tree: { sha: revision === head ? changed.sha : empty.sha } },
          files:
            revision === base
              ? []
              : [{ filename: file, status: revision === head ? "added" : "removed" }],
        },
      };
    };
    expect(await checkUpstream(baseline, { now: () => 0, transport })).toMatchObject({
      status: "review-required",
      baseline: base,
      head: final,
      changes: [
        { commit: head, paths: [file] },
        { commit: final, paths: [file] },
      ],
    });
  });
});
