import { expect, it, vi } from "vitest";
import { createImportHandler } from "./import-routing.js";
import { importRequestSchema, importUnavailable } from "./import-contract.js";
const request = {
  hostId: "host-a",
  generation: 1,
  command: { action: "start" as const },
};
it("strict browser contract rejects filenames and untrusted evidence", () => {
  expect(importRequestSchema.safeParse({ ...request, file: "/secret" }).success).toBe(false);
  expect(importRequestSchema.safeParse({ ...request, knownWorkspaces: ["/secret"] }).success).toBe(
    false,
  );
  expect(
    importRequestSchema.safeParse({
      ...request,
      command: {
        action: "configure",
        configuration: {
          bbRoot: "../escape",
          ordinaryRoots: [],
          workspaces: ["/work"],
        },
      },
    }).success,
  ).toBe(false);
});
it("rechecks host changes after queued metadata and never dispatches to an old host", async () => {
  let selection = { hostId: "host-a", generation: 1 };
  let release!: () => void;
  const wait = new Promise<void>((r) => (release = r)),
    call = vi.fn();
  const activeReads = new Set<AbortController>();
  const handler = createImportHandler({
    selection: () => selection,
    enrolled: async () => ({ status: "connected" }),
    activeReads,
    sdk: { environments: { list: async () => [] } as any },
    prepare: async () => {
      await wait;
    },
    call,
  });
  const pending = handler(request);
  await Promise.resolve();
  selection = { hostId: "host-b", generation: 2 };
  release();
  expect((await pending).reason).toBe("selection-changed");
  expect(call).not.toHaveBeenCalled();
  expect(activeReads.size).toBe(0);
});
it("status never requests scope metadata; configuration passes only selected-host paths", async () => {
  const list = vi.fn(async () => [
    { hostId: "host-b", path: "/foreign" },
    { hostId: "host-a", path: "/known" },
  ]);
  const call = vi.fn(
      async (_host: string, _signal: AbortSignal, _input: { knownWorkspaces: string[] }) =>
        importUnavailable("not-configured"),
    ),
    prepare = vi.fn();
  const handler = createImportHandler({
    selection: () => ({ hostId: "host-a", generation: 1 }),
    enrolled: async () => ({ status: "connected" }),
    activeReads: new Set(),
    sdk: { environments: { list } as any },
    prepare,
    call,
  });
  await handler({ ...request, command: { action: "status" } });
  expect(list).not.toHaveBeenCalled();
  expect(prepare).not.toHaveBeenCalled();
  await handler({
    ...request,
    command: {
      action: "configure",
      configuration: {
        bbRoot: "/source",
        ordinaryRoots: [],
        workspaces: ["/known"],
      },
    },
  });
  expect(call.mock.calls.at(-1)?.[2].knownWorkspaces).toEqual(["/known"]);
});
it("suppresses committed old-host results without describing rollback", async () => {
  let selection = { hostId: "host-a", generation: 1 };
  const handler = createImportHandler({
    selection: () => selection,
    enrolled: async () => ({ status: "connected" }),
    activeReads: new Set(),
    sdk: { environments: { list: async () => [] } as any },
    prepare: async () => {},
    call: async () => {
      selection = { hostId: "host-b", generation: 2 };
      return importUnavailable("not-configured");
    },
  });
  expect((await handler({ ...request, command: { action: "cancel" } })).reason).toBe(
    "selection-changed",
  );
});
