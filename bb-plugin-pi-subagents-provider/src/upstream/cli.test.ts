import { expect, it, vi } from "vitest";
import { checkerCommand } from "./cli.ts";

it.each(["26.0.0", "26.3.0", "26.12.1", "26.99.99"])(
  "runs silently without an agent or scheduler for a complete unchanged head on Node %s",
  async (nodeVersion) => {
    const base = "a".repeat(40);
    const baseline = {
      schemaVersion: 1,
      repository: "https://github.com/get-bb/bb.git",
      branch: "main",
      revision: base,
      sourcePath: "plugins/provider-pi",
      watchedContractPaths: ["packages/plugin-sdk"],
    };
    const readBaseline = vi.fn(async () => baseline);
    const output = await checkerCommand(
      ["--source", "/owned/fixture", "--project", "proj_fixture"],
      {
        readBaseline,
        now: () => 0,
        projectId: "proj_fixture",
        nodeVersion,
        transport: async (p) => ({
          status: 200,
          next: false,
          data: p.includes("branches")
            ? { commit: { sha: base } }
            : {
                status: "identical",
                base_commit: { sha: base },
                merge_base_commit: { sha: base },
                total_commits: 0,
                ahead_by: 0,
                commits: [],
              },
        }),
      },
    );
    expect(output).toEqual({ exitCode: 0, stdout: "", stderr: "" });
    expect(readBaseline).toHaveBeenCalledWith("/owned/fixture");
  },
);

it.each([
  ...["22.0.0", "24.15.0", "25.9.0", "27.0.0", "26.0", "26.0.0-rc.1"].map((nodeVersion) => ({
    args: ["--source", "/owned/fixture", "--project", "proj_fixture"],
    nodeVersion,
  })),
  { args: ["--source", "relative", "--project", "proj_fixture"], nodeVersion: "26.12.1" },
  { args: ["--source", "/owned/fixture", "--project", "proj_other"], nodeVersion: "26.12.1" },
])(
  "fails before transport or baseline access for invalid runtime or scope %j",
  async ({ args, nodeVersion }) => {
    const transport = vi.fn();
    const readBaseline = vi.fn();
    const output = await checkerCommand(args, {
      transport,
      readBaseline,
      nodeVersion,
      projectId: "proj_fixture",
    });
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain("inconclusive");
    expect(transport).not.toHaveBeenCalled();
    expect(readBaseline).not.toHaveBeenCalled();
  },
);
