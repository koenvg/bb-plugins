import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePiBridgeSessionDir, resolvePiSessionFilePath } from "./session-paths.js";

describe("independent session storage", () => {
  it("does not reuse the bundled Pi directory or its override", () => {
    const env = { BB_PI_BRIDGE_SESSION_DIR: "/bundled/pi" };
    expect(resolvePiBridgeSessionDir({ env })).toBe(join(homedir(), ".bb", "pi-subagents-bridge-sessions"));
    expect(resolvePiSessionFilePath({ env, threadId: "thr_test" })).toBe(join(homedir(), ".bb", "pi-subagents-bridge-sessions", "thr_test.jsonl"));
  });

  it("accepts only the fork's explicit session override", () => {
    expect(resolvePiBridgeSessionDir({ env: { BB_PI_SUBAGENTS_BRIDGE_SESSION_DIR: "/fork/pi" } })).toBe("/fork/pi");
  });
});
