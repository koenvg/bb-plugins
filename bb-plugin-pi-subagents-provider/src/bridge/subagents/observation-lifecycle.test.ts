import { expect, it } from "vitest";
import { createSubagentObservation } from "./observation.js";
import { createViewStore } from "./view-store.js";
import type { ViewState } from "../../subagents-contract.js";

const sessionFile = "/owned/session";
const owner = { sessionId: "pi", sessionFile, generation: 1 };
const node = { id: "run", label: "reader", kind: "subagent", state: "running" } as const;

it("cannot publish a late unavailable assessment after disposal or poison a reused store", async () => {
  const states: ViewState[] = [];
  const view = createViewStore(
    (state) => states.push(state),
    () => 1,
  );
  let reject!: (error: Error) => void;
  const observation = createSubagentObservation({
    generation: 1,
    sessionFile,
    view,
    emit() {},
    reconcile: () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  });
  const pending = observation.refresh();
  observation.dispose("replacement");
  view.background({ ...owner, generation: 2 }, [{ ...node, label: "replacement" }], false);
  reject(Error("old timeout"));
  await pending;
  expect(states.at(-1)).toMatchObject({
    availability: "available",
    reason: "",
    rows: [{ generation: 2, label: "replacement" }],
  });
  expect(view.snapshot()).toMatchObject({ availability: "available", reason: "" });
});

it("keeps the prior owner usable after a replacement fails before receiving status", () => {
  const states: ViewState[] = [];
  const view = createViewStore(
    (state) => states.push(state),
    () => 1,
  );
  view.background(owner, [node], false);
  const failed = createSubagentObservation({
    generation: 2,
    sessionFile,
    view,
    emit() {},
    reconcile: async () => undefined,
  });
  failed.dispose("exit");
  expect(states.at(-1)).toMatchObject({
    availability: "available",
    reason: "",
    rows: [{ generation: 1, state: "running" }],
  });
  view.background(owner, [{ ...node, state: "complete" }], false);
  expect(states.at(-1)).toMatchObject({
    availability: "available",
    rows: [{ generation: 1, state: "complete" }],
  });
});
