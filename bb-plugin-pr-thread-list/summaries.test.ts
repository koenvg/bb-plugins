import { describe, expect, it, vi } from "vitest";
import { listSummaries } from "./summaries";

type Sdk = Parameters<typeof listSummaries>[0];

function fakeSdk({ plugins = [{ id: "github-insight", enabled: true, status: "running" }], listPlugins }: {
  plugins?: { id: string; enabled: boolean; status: string }[];
  listPlugins?: () => Promise<unknown>;
} = {}) {
  const metadata: Record<string, Record<string, unknown> | Error> = {
    withPr: { prSummary: { version: 1 } },
    withoutPr: {},
    broken: new Error("read failed"),
    old: { prSummary: { version: 1 } },
  };
  const getPluginMetadata = vi.fn(async ({ threadId }: { threadId: string }) => {
    const value = metadata[threadId]!;
    if (value instanceof Error) throw value;
    return value;
  });
  const sdk = {
    plugins: { list: listPlugins ?? (async () => ({ plugins })) },
    threads: {
      list: vi.fn(async () => [
        { id: "withPr", archivedAt: null }, { id: "withoutPr", archivedAt: null },
        { id: "broken", archivedAt: null }, { id: "old", archivedAt: 5 },
      ]),
      getPluginMetadata,
    },
  } as unknown as Sdk;
  return { sdk, getPluginMetadata };
}

describe("listSummaries", () => {
  it("returns the github-insight summary of each active thread that has one", async () => {
    const { sdk, getPluginMetadata } = fakeSdk();
    await expect(listSummaries(sdk)).resolves.toEqual({
      insightAvailable: true, summaries: { withPr: { version: 1 } },
    });
    expect(getPluginMetadata).toHaveBeenCalledWith({ threadId: "withPr", pluginId: "github-insight" });
    expect(getPluginMetadata).not.toHaveBeenCalledWith(expect.objectContaining({ threadId: "old" }));
  });
  it("reports github-insight as unavailable when it is missing or disabled", async () => {
    for (const plugins of [[], [{ id: "github-insight", enabled: false, status: "disabled" }]]) {
      const { sdk, getPluginMetadata } = fakeSdk({ plugins });
      await expect(listSummaries(sdk)).resolves.toEqual({ insightAvailable: false, summaries: {} });
      expect(getPluginMetadata).not.toHaveBeenCalled();
    }
  });
  it("still reads summaries when the plugin list cannot be read", async () => {
    const { sdk } = fakeSdk({ listPlugins: () => Promise.reject(new Error("forbidden")) });
    await expect(listSummaries(sdk)).resolves.toMatchObject({ insightAvailable: true, summaries: { withPr: {} } });
  });
});
