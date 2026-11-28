// @vitest-environment jsdom
import { fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { ExperimentalThreadContextSegmentProps } from "@get-bb/plugin-sdk/app";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { requireFixtureValue } from "../require-fixture-value.test-support";

const app = await loadPluginApp(() => import("../app"));
const segment = requireFixtureValue(
  app.threadContextSegments.find(({ id }) => id === "workspace-changes"),
);
const useVisible = requireFixtureValue(segment.useVisible);
const Details = requireFixtureValue(segment.details);
const input = {
  threadId: "thr_workspace",
  projectId: "proj_1",
  environment: { id: "env_workspace" },
};
const clean = {
  state: "clean",
  fileCount: 0,
  insertions: 0,
  deletions: 0,
  lineStatsComplete: true,
  files: [],
};
const committed = {
  mergeBaseBranch: "origin/release",
  fileCount: 1,
  insertions: 13,
  deletions: 7,
  lineStatsComplete: true,
  files: [{ path: "src/committed.ts" }],
};

function renderSummary() {
  let workspace = {
    mergeBase: committed,
    workingTree: { ...clean, files: [] as Array<{ path: string }> },
  };
  const openTab = vi.fn(() => false);
  const status = vi.fn(() => ({ env_workspace: { outcome: "available", workspace } }));
  const WorkspaceFixture = () => {
    const [expanded, setExpanded] = useState(false);
    const props: ExperimentalThreadContextSegmentProps = {
      ...input,
      segments: [],
      isExpanded: expanded,
      onToggle: () => setExpanded(!expanded),
    };
    return useVisible(input) ? (
      <>
        <segment.summary {...props} />
        <Details {...props} />
      </>
    ) : null;
  };
  const slot = renderSlot(
    { component: WorkspaceFixture },
    {},
    { rpc: { status }, experimental_panel: { openTab } },
  );
  return {
    ...slot,
    openTab,
    status,
    setWorkingTree: async (workingTree: typeof workspace.workingTree) => {
      workspace = { ...workspace, workingTree };
      await slot.behavior.experimental_invalidateRpc(["status:env_workspace"], "bb--git");
    },
  };
}

afterEach(cleanup);

it("uses the workspace key and refreshes the tally and file list when git invalidates it", async () => {
  const slot = renderSummary();
  await slot.findByRole("button", {
    name: "Committed: 1 file, 13 lines added, 7 lines deleted. Open Changes",
  });
  expect(slot.status).toHaveBeenCalledWith({ keys: ["env_workspace"] });
  fireEvent.click(slot.getByRole("button", { name: "Expand changed files" }));
  await slot.findByRole("button", { name: "src/committed.ts" });
  expect(slot.openTab).not.toHaveBeenCalled();

  await slot.setWorkingTree({
    state: "dirty_and_committed_unmerged",
    fileCount: 1,
    insertions: 3,
    deletions: 2,
    lineStatsComplete: true,
    files: [{ path: "src/working.ts" }],
  });
  await slot.findByRole("button", {
    name: "Uncommitted: 1 file, 3 lines added, 2 lines deleted. Open Changes",
  });
  await slot.findByRole("button", { name: "src/working.ts" });
  expect(slot.queryByRole("button", { name: "src/committed.ts" })).toBeNull();
});

it("only attempts to open Changes from the summary and file links, even when the host declines", async () => {
  const slot = renderSummary();
  fireEvent.click(await slot.findByRole("button", { name: /Committed:.*Open Changes/ }));
  expect(slot.queryByRole("button", { name: "src/committed.ts" })).toBeNull();
  fireEvent.click(slot.getByRole("button", { name: "Expand changed files" }));
  fireEvent.click(await slot.findByRole("button", { name: "src/committed.ts" }));
  expect(slot.openTab.mock.calls).toEqual([
    [{ tab: { id: "changes", context: { kind: "thread" }, availability: "action" } }],
    [{ tab: { id: "changes", context: { kind: "thread" }, availability: "action" } }],
  ]);
  fireEvent.click(slot.getByRole("button", { name: "Collapse changed files" }));
  await waitFor(() => expect(slot.queryByRole("button", { name: "src/committed.ts" })).toBeNull());
});
