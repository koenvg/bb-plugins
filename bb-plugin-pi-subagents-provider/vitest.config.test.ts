import { availableParallelism } from "node:os";
import { expect, it, vi } from "vitest";

vi.mock("node:os", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:os")>()),
  availableParallelism: vi.fn(),
}));

it.each([
  [1, 1],
  [2, 1],
  [3, 1],
  [4, 2],
  [8, 4],
  [16, 4],
])("bounds workers to %i available CPUs with child-process headroom", async (cpus, workers) => {
  vi.mocked(availableParallelism).mockReturnValue(cpus);
  vi.resetModules();
  const { default: config } = await import("./vitest.config.js");
  expect(config.test?.maxWorkers).toBe(workers);
});
