import { expect, it } from "vitest";
import { createViewStore } from "./view-store.js";
const owner = { sessionId: "pi", sessionFile: "/owned/session", generation: 1 };
it("keeps parent-scoped steps, canonical nested identities and known outcomes on capture errors", () => {
  const v = createViewStore(
    () => {},
    () => 10,
  );
  const tree = {
    id: "root",
    kind: "workflow",
    label: "review",
    state: "complete",
    children: [
      {
        id: "step:0",
        kind: "step",
        label: "outer",
        state: "complete",
        children: [
          {
            id: "child",
            kind: "subagent",
            label: "nested",
            state: "running",
            children: [{ id: "step:0", kind: "step", label: "inner", state: "running" }],
          },
        ],
      },
    ],
  };
  const targets = v.background(owner, [tree as never], false);
  expect(v.snapshot().rows).toHaveLength(4);
  expect(new Set(v.snapshot().rows.map((r) => r.id)).size).toBe(4);
  expect(targets.find((t) => t.childId === "step:0" && t.asyncId === "child")).toBeDefined();
  v.capture(targets[0]!.id, { status: "timeout", capturedAt: 10, reason: "No reply" });
  expect(v.snapshot().rows.find((r) => r.runId === "root")!.state).toBe("complete");
});
it("foreground partial/final rows use published indices, not positions, and preserve output on disposal", () => {
  const v = createViewStore(
    () => {},
    () => 10,
  );
  const details = {
    mode: "parallel",
    runId: "fg",
    results: [{ index: 4, agent: "a", task: "task", finalOutput: "answer", exitCode: 0 }],
  };
  v.foreground(owner, details, false);
  const id = v.snapshot().rows[0]!.id;
  v.foreground(owner, details, true);
  expect(v.snapshot().rows).toHaveLength(1);
  expect(v.snapshot().rows[0]).toMatchObject({
    id,
    state: "complete",
    capture: { finalOutput: "answer" },
  });
  v.dispose(owner, "exit");
  expect(v.snapshot().rows[0]!.capture?.finalOutput).toBe("answer");
});
it("coalesces equal snapshots, preserves capture time on failure and stays within the state budget", () => {
  let clock = 1;
  const states: unknown[] = [];
  const v = createViewStore(
    (s) => states.push(s),
    () => clock,
  );
  const node = { id: "root", kind: "subagent", label: "reviewer", state: "complete" } as const;
  const targets = v.background(owner, [node], false);
  clock = 2;
  v.background(owner, [node], false);
  expect(states).toHaveLength(1);
  v.capture(targets[0]!.id, { status: "captured", capturedAt: 1, finalOutput: "answer" });
  v.capture(targets[0]!.id, { status: "timeout", capturedAt: 2, reason: "No reply" });
  expect(v.snapshot().rows[0]!.capture).toMatchObject({
    capturedAt: 1,
    attemptedAt: 2,
    finalOutput: "answer",
  });
  for (let i = 0; i < 150; i++) v.background(owner, [{ ...node, id: `r${i}` }], false);
  expect(v.snapshot().rows.length).toBeLessThanOrEqual(128);
  expect(v.snapshot().omitted).toBeGreaterThan(0);
  expect(Buffer.byteLength(JSON.stringify(v.snapshot()))).toBeLessThanOrEqual(256 * 1024);
});
it("does not guess the owner of materialized inner workflow lanes with repeated keys", () => {
  const v = createViewStore(
    () => {},
    () => 1,
  );
  const roots = [
    {
      id: "outer",
      kind: "workflow",
      label: "outer",
      state: "complete",
      children: [
        {
          id: "lane",
          kind: "step",
          label: "materialized",
          state: "complete",
          children: [{ id: "same-key", kind: "step", label: "inner", state: "complete" }],
        },
        { id: "same-key", kind: "step", label: "outer different output", state: "complete" },
      ],
    },
  ] as const;
  const targets = v.background(owner, roots as unknown as import("./protocol.js").RunNode[], false);
  expect(targets.filter((t) => t.childId === "same-key")).toHaveLength(1);
  const outerTarget = targets.find((t) => t.childId === "same-key")!;
  v.capture(outerTarget.id, {
    status: "captured",
    capturedAt: 1,
    finalOutput: "outer answer, not the inner result",
  });
  expect(v.snapshot().rows.find((r) => r.label === "inner")?.capture?.finalOutput).toBeUndefined();
  expect(
    v.snapshot().rows.find((r) => r.label === "outer different output")?.capture?.finalOutput,
  ).toContain("outer answer");
  expect(v.snapshot().rows.find((r) => r.label === "inner")?.capture).toMatchObject({
    status: "unavailable",
  });
});
