import { expect, it } from "vitest";
import { retainCapture } from "./capture-history.js";
import type { Capture } from "./subagents-contract.js";
const older: Capture = {
  status: "captured",
  capturedAt: 1,
  task: "task",
  finalOutput: "answer",
  messages: [{ role: "assistant", kind: "text", text: "accepted" }],
  truncated: { task: true, finalOutput: true, messages: 3 },
};

it("retains accepted content and capture time through failure without mutating either input", () => {
  const newer: Capture = { status: "timeout", capturedAt: 2, reason: "No reply" };
  const oldCopy = structuredClone(older);
  const newCopy = structuredClone(newer);
  expect(retainCapture(newer, older)).toMatchObject({
    ...older,
    status: "timeout",
    capturedAt: 1,
    attemptedAt: 2,
    reason: "No reply",
  });
  expect(older).toEqual(oldCopy);
  expect(newer).toEqual(newCopy);
});

it("treats explicit budget omissions as authoritative while preserving the legacy empty-array fallback", () => {
  const omitted: Capture = {
    status: "captured",
    capturedAt: 2,
    task: "",
    finalOutput: "",
    messages: [],
    truncated: { task: true, finalOutput: true, messages: 1 },
  };
  expect(retainCapture(omitted, older)).toEqual(omitted);
  expect(retainCapture(omitted, retainCapture(omitted, older))).toEqual(omitted);
  const absent: Capture = {
    status: "captured",
    capturedAt: 2,
    messages: [],
    truncated: { task: false, finalOutput: false, messages: 0 },
  };
  expect(retainCapture(absent, older)).toMatchObject({
    capturedAt: 2,
    task: "task",
    finalOutput: "answer",
    messages: older.messages,
    truncated: older.truncated,
  });
});
