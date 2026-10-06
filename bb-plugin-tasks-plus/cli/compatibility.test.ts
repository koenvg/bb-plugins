import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";

import { createStore } from "../api";
import { registerTasksCli } from "./index";

// Capture the public parser contract before moving the command definitions.
const commands = [
  "",
  "status",
  "project",
  "project create",
  "project list",
  "project show",
  "project update",
  "folder",
  "folder create",
  "folder list",
  "folder update",
  "folder delete",
  "create",
  "list",
  "show",
  "update",
  "comment",
  "label",
  "label create",
  "label list",
  "label delete",
  "attachment",
  "attachment add",
  "attachment get",
  "attachment list",
  "attachment remove",
  "preset",
  "preset list",
  "preset show",
  "preset create",
  "preset update",
  "preset delete",
  "dispatch",
  "attach",
  "detach",
  "threads",
  "seed-demo",
];

describe("CLI compatibility", () => {
  it("keeps exact help, command order, and parser errors for every command", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "tasks" });
    try {
      registerTasksCli(bb, createStore(bb), { name: "Tasks", version: "0.1.2" });
      const results: Record<string, unknown> = {};
      for (const command of commands) {
        const argv = command ? command.split(" ") : [];
        results[command || "root"] = {
          help: await harness.behavior.runCli([...argv, "--help"]),
          textError: await harness.behavior.runCli([...argv, "--unknown-option"]),
          jsonError: await harness.behavior.runCli([...argv, "--unknown-option", "--json"]),
        };
      }
      expect(results).toMatchSnapshot();
    } finally {
      await harness.lifecycle.dispose();
    }
  });
});
