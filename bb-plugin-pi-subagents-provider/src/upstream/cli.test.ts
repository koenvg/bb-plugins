import { expect, it, vi } from "vitest";
import { checkerCommand } from "./cli.ts";

it("runs silently without an agent or scheduler for a complete unchanged head", async () => {
  const base = "a".repeat(40);
  const baseline = { schemaVersion: 1, repository: "https://github.com/get-bb/bb.git", branch: "main", revision: base, sourcePath: "plugins/provider-pi", watchedContractPaths: ["packages/plugin-sdk"] };
  const readBaseline = vi.fn(async () => baseline);
  const output = await checkerCommand(["--source", "/owned/fixture", "--project", "proj_fixture"], {
    readBaseline, now: () => 0, projectId: "proj_fixture", nodeVersion: "24.15.0",
    transport: async (p) => ({ status: 200, next: false, data: p.includes("branches") ? { commit: { sha: base } } : {
      status: "identical", base_commit: { sha: base }, merge_base_commit: { sha: base }, total_commits: 0, ahead_by: 0, commits: [],
    } }),
  });
  expect(output).toEqual({ exitCode: 0, stdout: "", stderr: "" });
  expect(readBaseline).toHaveBeenCalledWith("/owned/fixture");
});

it.each([
  { args: ["--source", "/owned/fixture", "--project", "proj_fixture"], nodeVersion: "22.0.0" },
  { args: ["--source", "relative", "--project", "proj_fixture"], nodeVersion: "24.15.0" },
  { args: ["--source", "/owned/fixture", "--project", "proj_other"], nodeVersion: "24.15.0" },
])("fails before transport or baseline access for invalid runtime or scope %j", async ({ args, nodeVersion }) => {
  const transport = vi.fn(); const readBaseline = vi.fn();
  const output = await checkerCommand(args, { transport, readBaseline, nodeVersion, projectId: "proj_fixture" });
  expect(output.exitCode).toBe(1);
  expect(output.stderr).toContain("inconclusive");
  expect(transport).not.toHaveBeenCalled(); expect(readBaseline).not.toHaveBeenCalled();
});
