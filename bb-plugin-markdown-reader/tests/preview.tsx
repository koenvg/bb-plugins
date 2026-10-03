import { createRoot } from "react-dom/client";
import { Reader } from "../reader";
import type { ReaderTarget, ReadResult } from "../source";
import report from "./fixtures/report.md?raw";
import "../app.css";
import "./preview.css";

const target: ReaderTarget = { path: "reports/workspace.md", source: { kind: "workspace", threadId: null, environmentId: "fixture", projectId: "fixture", experimental_hostId: "fixture-host" } };
const readDocument = async (): Promise<ReadResult> => ({ kind: "ready", snapshot: {
  text: report, sha256: "fixture", sizeBytes: report.length, target,
  hostId: "fixture-host", rootPath: "/fixture", documentPath: "/fixture/reports/workspace.md", documentDirectory: "/fixture/reports",
} });
const params = new URLSearchParams(location.search);
const width = Number(params.get("width")) || 760;
document.documentElement.dataset.theme = params.get("theme") || "light";
createRoot(document.getElementById("root")!).render(
  <div className="fixture-layout">
    <aside className="fixture-outside" aria-label="Host style sentinel"><h2>Outside the reader</h2><p>This text must keep the fixture host style.</p></aside>
    <div className="fixture-panel" style={{ width, maxWidth: "100%" }}>
      <Reader target={target} readDocument={readDocument} Original={() => <p>Bound BB preview placeholder. No plugin selection occurs.</p>} />
    </div>
  </div>,
);
