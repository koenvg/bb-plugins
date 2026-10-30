import { installTestPluginRuntime } from "@get-bb/plugin-sdk/testing/app";
import { createRoot } from "react-dom/client";
import { boundedValue, VIEW_BYTES, viewSchema, type ViewState } from "../src/subagents-contract.js";
import { SubagentsView } from "../src/ui/subagents-view.js";
import "../src/ui/subagents.css";

const state: ViewState = {
  kind: "pi-subagents-view",
  version: 1,
  updatedAt: 100000,
  availability: "available",
  reason: "",
  omitted: 2,
  rows: [
    {
      id: "workflow",
      runId: "workflow-run",
      sessionId: "synthetic-session",
      generation: 1,
      source: "foreground",
      kind: "workflow",
      label: "Review workflow",
      state: "complete",
      incomplete: false,
      observedAt: 100000,
      capture: { status: "captured", capturedAt: 100000, task: "Coordinate captured reviews." },
    },
    {
      id: "workflow-child",
      parentId: "workflow",
      runId: "workflow-child-run",
      sessionId: "synthetic-session",
      generation: 1,
      source: "foreground",
      kind: "step",
      label: "Check captured review structure",
      state: "complete",
      incomplete: false,
      observedAt: 100000,
    },
    {
      id: "beta",
      runId: "captured-beta-run",
      sessionId: "synthetic-session",
      generation: 1,
      source: "background",
      kind: "subagent",
      label:
        "delegate reviewing captured conversation attribution and repeated labels across narrow Subagents panels without changing the original source text",
      state: "complete",
      incomplete: false,
      observedAt: 100000,
      capture: {
        status: "captured",
        capturedAt: 99000,
        task: "Review beta captured attribution and confirm that the repeated label selects only the intended conversation.\n\nKeep beta task line two exactly as captured.",
        messages: [
          {
            role: "assistant",
            kind: "text",
            text: "BETA transcript sentinel. Attribution belongs to beta.",
          },
        ],
        finalOutput: "BETA final-output sentinel. Only the beta review is complete.",
        truncated: { task: false, finalOutput: false, messages: 3 },
      },
    },
    {
      id: "alpha",
      runId: "captured-alpha-run",
      sessionId: "synthetic-session",
      generation: 1,
      source: "background",
      kind: "subagent",
      label:
        "delegate reviewing captured conversation attribution and repeated labels across narrow Subagents panels without changing the original source text",
      state: "complete",
      incomplete: false,
      observedAt: 100000,
      capture: {
        status: "captured",
        capturedAt: 98000,
        task: "Review alpha captured attribution and confirm that the repeated label selects only the intended conversation.\n\nKeep alpha task line two exactly as captured.",
        messages: [
          {
            role: "assistant",
            kind: "text",
            text: "ALPHA transcript sentinel. Attribution belongs to alpha.",
          },
        ],
        finalOutput: "ALPHA final-output sentinel. Only the alpha review is complete.",
        truncated: { task: false, finalOutput: false, messages: 1 },
      },
    },
  ],
};
if (!boundedValue(state, VIEW_BYTES)) throw new Error("Synthetic capture exceeds VIEW_BYTES");
viewSchema.parse(state);
installTestPluginRuntime();

const root = document.getElementById("root")!;
if (new URLSearchParams(location.search).get("layout") === "panel") root.style.width = "360px";
createRoot(root).render(
  <SubagentsView
    state={state}
    warning="Available history is bounded to the newest 64 extension-state events. Older observations may be absent."
  />,
);
