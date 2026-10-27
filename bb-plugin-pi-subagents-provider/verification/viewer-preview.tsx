// Unsigned source preview. The public SDK harness uses a plain-text Markdown stand-in.
import { installTestPluginRuntime } from "@get-bb/plugin-sdk/testing/app";
import { createRoot } from "react-dom/client";
import { SubagentsView } from "../src/ui/subagents-view.js";
import { type ViewState } from "../src/subagents-contract.js";
import "../src/ui/subagents.css";
installTestPluginRuntime();
const base = {
  sessionId: "preview",
  generation: 1,
  source: "foreground",
  kind: "subagent",
  state: "complete",
  incomplete: false,
  observedAt: 100000,
} as const;
const state: ViewState = {
  kind: "pi-subagents-view",
  version: 1,
  updatedAt: 100000,
  availability: "available",
  reason: "",
  omitted: 0,
  rows: [
    {
      ...base,
      id: "empty-root",
      runId: "empty-root-run",
      kind: "workflow",
      label: "Empty review workflow",
    },
    {
      ...base,
      id: "review",
      parentId: "empty-root",
      runId: "review-run",
      label: "Review viewer behavior",
      durationMs: 102000,
      capture: {
        status: "captured",
        capturedAt: 100000,
        task: "Review the captured conversation viewer. Keep execution and capture availability separate.",
        resolvedModel: { provider: "openai", model: "gpt-5.4", capturedAt: 99000 },
        messages: [
          {
            role: "assistant",
            kind: "text",
            text: "The run list stays above the conversation. Captured metadata does not imply a live model feed.",
          },
          {
            role: "assistant",
            kind: "toolCall",
            name: "read",
            text: '{"path":"src/subagents-contract.ts"}',
          },
          {
            role: "toolResult",
            kind: "toolResult",
            name: "read",
            text: "Optional capture metadata stays bounded.",
          },
          {
            role: "assistant",
            kind: "text",
            text: "Task, prose, and final output use the public host renderer. Tools remain escaped and collapsed.\n\n".repeat(
              8,
            ),
          },
        ],
        finalOutput: "Review complete. Capture limits and provenance remain visible.",
      },
    },
    {
      ...base,
      id: "inspect",
      runId: "inspect-run",
      label: "Inspect capture metadata",
      state: "running",
      durationMs: 38000,
      capture: {
        status: "captured",
        capturedAt: 100000,
        task: "Check model and timing metadata without changing the provider.",
        resolvedModel: { provider: "anthropic", model: "claude-sonnet-4-6", capturedAt: 100000 },
        messages: [
          {
            role: "assistant",
            kind: "text",
            text: "This run was running at observation. It is not a live feed.",
          },
        ],
      },
    },
    {
      ...base,
      id: "failed",
      runId: "failed-run",
      label: "Check viewer tests",
      state: "failed",
      durationMs: 24000,
      capture: {
        status: "timeout",
        capturedAt: 90000,
        attemptedAt: 100000,
        reason: "No reply; accepted content retained",
        messages: [
          {
            role: "toolResult",
            kind: "toolResult",
            name: "bash",
            isError: true,
            text: "Test failed",
          },
        ],
        finalOutput: "Prior accepted output",
      },
    },
    {
      ...base,
      id: "empty-nested",
      parentId: "review",
      runId: "empty-nested-run",
      kind: "workflow",
      label: "Empty nested workflow",
      capture: { status: "captured", capturedAt: 100000 },
    },
    {
      ...base,
      id: "nested",
      parentId: "empty-nested",
      runId: "nested-run",
      label: "Check nested capture",
      source: "background",
      state: "complete",
      capture: {
        status: "captured",
        capturedAt: 100000,
        truncated: { task: false, finalOutput: false, messages: 4 },
      },
    },
  ],
};
const root = createRoot(document.getElementById("root")!);
function render(next: ViewState | undefined, loading = false, error?: string) {
  root.render(<SubagentsView state={next} loading={loading} error={error} />);
}
declare global {
  interface Window {
    viewerPreview: { state: ViewState; render: typeof render };
  }
}
window.viewerPreview = { state, render };
render(state);
