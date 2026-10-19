import { describe, expect, it } from "vitest";
import {
  DELETED_PATH,
  RENAMED_PATH,
  WORKSPACE_PATH,
  loopbackOrigin,
  rendererFixture,
  unsupportedSlotBundle,
} from "./fixture";

describe("BB renderer fixture boundary", () => {
  it("accepts an explicit local BB origin and rejects remote or decorated URLs", () => {
    expect(loopbackOrigin("http://127.0.0.1:38886")).toBe("http://127.0.0.1:38886");
    for (const url of [
      "https://example.com",
      "http://user:secret@localhost",
      "http://localhost/",
      "http://localhost?x=1",
    ]) {
      expect(() => loopbackOrigin(url)).toThrow("bare loopback HTTP origin");
    }
  });

  it("moves exactly the production header property to the unsupported filename slot", () => {
    expect(
      unsupportedSlotBundle("FileDiff({renderCustomHeader:header,renderHeaderPrefix:prefix})"),
    ).toBe("FileDiff({renderHeaderFilenameSuffix:header,renderHeaderPrefix:prefix})");
    expect(() => unsupportedSlotBundle("FileDiff({})")).toThrow("exactly one");
    expect(() => unsupportedSlotBundle("renderCustomHeader:a,renderCustomHeader:b")).toThrow(
      "exactly one",
    );
  });

  it("uses the supplied workspace and distinct current paths for renamed and deleted files", () => {
    const fixture = rendererFixture("thr-owned", "env-worktree");
    const result = fixture.rpc("getChanges", {
      threadId: "thr-owned",
      target: { kind: "branch_committed" },
    });
    expect(result).toMatchObject({
      kind: "ok",
      environmentId: "env-worktree",
      query: { target: "branch_committed", mergeBaseBranch: "origin/main" },
      files: [
        { path: WORKSPACE_PATH, status: "modified", previousPath: null },
        { path: RENAMED_PATH, status: "renamed", previousPath: "bbp-215-previous-name.txt" },
        { path: DELETED_PATH, status: "deleted", previousPath: null },
      ],
    });
  });

  it("keeps Viewed writes local to one fixture and target", () => {
    const fixture = rendererFixture("thr-owned", "env-worktree");
    const other = rendererFixture("thr-owned", "env-worktree");
    const all = { threadId: "thr-owned", target: { kind: "all" } };
    expect(
      fixture.rpc("updateViewed", {
        ...all,
        set: { [WORKSPACE_PATH]: "patch-identity" },
        remove: [],
      }),
    ).toEqual({ kind: "ok" });
    expect(fixture.rpc("getViewed", all)).toEqual({
      kind: "ok",
      marks: { [WORKSPACE_PATH]: "patch-identity" },
    });
    expect(other.rpc("getViewed", all)).toEqual({ kind: "ok", marks: {} });
    expect(fixture.rpc("getViewed", { ...all, target: { kind: "uncommitted" } })).toEqual({
      kind: "ok",
      marks: {},
    });
    fixture.rpc("updateViewed", { ...all, set: {}, remove: [WORKSPACE_PATH] });
    expect(fixture.rpc("getViewed", all)).toEqual({ kind: "ok", marks: {} });
  });

  it("keeps native panel tab persistence in one fixture and refuses stale revisions", () => {
    const fixture = rendererFixture("thr-owned", "env-worktree");
    const other = rendererFixture("thr-owned", "env-worktree");
    expect(
      fixture.tabs("PUT", {
        expectedRevision: 1,
        tabs: [{ id: "preview", kind: "workspace-file" }],
      }),
    ).toEqual({
      revision: 2,
      tabs: [{ id: "preview", kind: "workspace-file" }],
    });
    expect(fixture.tabs("GET")).toEqual({
      revision: 2,
      tabs: [{ id: "preview", kind: "workspace-file" }],
    });
    expect(other.tabs("GET")).toEqual({
      revision: 1,
      tabs: [
        { id: "thread-info:thread-info:none", kind: "thread-info" },
        { id: "git-diff:git-diff:none", kind: "git-diff" },
        { id: "new-tab:new-tab:none", kind: "new-tab" },
      ],
    });
    expect(() => fixture.tabs("PUT", { expectedRevision: 1, tabs: [] })).toThrow(
      "Unexpected tab write",
    );
    expect(() => fixture.tabs("DELETE")).toThrow("Unexpected tab write");
  });

  it("refuses other threads and sendFeedback instead of forwarding them to BB", () => {
    const fixture = rendererFixture("thr-owned", "env-worktree");
    expect(() => fixture.rpc("getChanges", { threadId: "thr-other" })).toThrow(
      "Unexpected RPC thread",
    );
    expect(() =>
      fixture.rpc("sendFeedback", { threadId: "thr-owned", text: "must not send" }),
    ).toThrow("Unexpected Changes RPC: sendFeedback");
  });
});
