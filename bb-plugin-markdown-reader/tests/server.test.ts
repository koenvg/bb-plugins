// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { createFakePluginHost, experimental_scanPublicSdkOnly } from "@get-bb/plugin-sdk/testing";
import plugin from "../server";

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => { for (const dispose of disposers.splice(0)) await dispose(); });

describe("public server RPC", () => {
  it("validates the live target and routes only a confined read to the selected host", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "markdown-reader", sdk: {
      environments: { get: async () => ({ id: "env", projectId: "project", hostId: "remote", path: "/work", status: "ready" }) },
      files: { read: async () => ({ content: "# Remote", sha256: "hash", contentEncoding: "utf8", sizeBytes: 8 }) },
    } });
    disposers.push(() => harness.lifecycle.dispose());
    plugin(bb);
    const target = { path: "note.md", source: { kind: "workspace", threadId: null, environmentId: "env", projectId: "project", experimental_hostId: "remote" } };
    const result = await harness.behavior.callRpc("read_document", target);
    expect(result).toMatchObject({ kind: "ready", snapshot: { text: "# Remote", hostId: "remote", rootPath: "/work", target } });
    expect(harness.inspection.sdk.callsTo("files.read")).toEqual([[{ hostId: "remote", rootPath: "/work", path: "/work/note.md" }]]);
    expect(harness.inspection.sdk.callsTo("files.write")).toEqual([]);
    await expect(harness.behavior.callRpc("read_document", { ...target, rootPath: "/arbitrary" })).rejects.toThrow();
    await expect(harness.behavior.callRpc("read_document", { path: "note.md", source: { kind: "workspace" } })).rejects.toThrow();
    expect(harness.inspection.sdk.callsTo("files.read")).toHaveLength(1);
  });
  it("imports only public SDK contracts and package-local modules", () => {
    const result = experimental_scanPublicSdkOnly(new URL("..", import.meta.url).pathname, {
      allow: [/^react$/, /^react-dom\/client$/, /^react-markdown$/, /^remark-gfm$/,
        /^@radix-ui\/react-slot$/, /^class-variance-authority$/, /^clsx$/, /^tailwind-merge$/,
        /^@testing-library\/(react|user-event)$/, /^vitest\/config$/],
    });
    expect(result.violations).toEqual([]);
    expect(result.privateDependencies).toEqual([]);
  });
});
