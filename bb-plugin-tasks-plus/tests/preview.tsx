import { StrictMode, useEffect, useRef, useState } from "react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { flushSync } from "react-dom";
import { AttachmentsGrid } from "../views/detail/attachments";
import { useAttachmentPreview } from "../views/detail/attachment-preview";
import { ShortcutProvider, useShortcuts } from "../shell/shortcut-provider";
import type { Attachment } from "../shared/contract";
import { previewDocument, readingReport, navigationDocument } from "./preview-document";
import "./preview.css";
import parityReport from "../../packages/markdown-document/test/fixtures/parity-report.md?raw";
import "../../packages/markdown-document/test/fixtures/parity.css";

const params = new URLSearchParams(location.search);
const documentFixture = params.has("report") ? readingReport : previewDocument;
const { fileName: name, source: text } = documentFixture;
document.documentElement.dataset.documentWidth = params.get("documentWidth") || "auto";
const parity = params.has("parity");
if (parity) document.documentElement.dataset.documentParity = "true";
const attachment: Attachment = {
  id: previewDocument.id,
  taskId: "fixture-task",
  fileName: name,
  mime: previewDocument.mime,
  sizeBytes: 100,
  isImage: false,
  createdAt: "2026-07-20T00:00:00.000Z",
};
const mode = new URLSearchParams(location.search).get("state") || "ready";
const originalFetch = window.fetch;
window.fetch = async (input, init) => {
  if (String(input).includes("/attachments/preview")) {
    document.documentElement.dataset.reads = String(
      Number(document.documentElement.dataset.reads || 0) + 1,
    );
    if (mode === "delayed")
      await new Promise<void>((resolve) =>
        window.addEventListener("fixture-ready", () => resolve(), { once: true }),
      );
    if (
      mode === "error" ||
      (mode === "recoverable" && document.documentElement.dataset.reads === "1")
    )
      return new Response("", { status: 500 });
    const source =
      mode === "empty"
        ? ""
        : mode === "dense-raw"
          ? "\n".repeat(30_000)
          : mode === "navigation"
            ? navigationDocument(location.origin)
            : parity
              ? parityReport
              : text;
    return Response.json({
      attachmentId: attachment.id,
      fileName: name,
      byteSize: new TextEncoder().encode(source).length,
      text: source,
    });
  }
  return originalFetch(input, init);
};
document.documentElement.dataset.theme =
  new URLSearchParams(location.search).get("theme") || "light";
function TaskFixture() {
  const fallback = useRef<HTMLButtonElement>(null);
  const [attachments, setAttachments] = useState([attachment]);
  const [choices, setChoices] = useState(false);
  const preview = useAttachmentPreview({
    taskId: "fixture-task",
    confirmedAttachments: attachments,
    fallbackRef: fallback,
  });
  const [shortcuts, setShortcuts] = useState(0);
  useShortcuts({
    "detail.status": () => setShortcuts((count) => count + 1),
    "detail.next": () => setShortcuts((count) => count + 1),
  });
  useEffect(() => {
    const remove = () => setAttachments([]);
    const listbox = () => flushSync(() => setChoices(true));
    window.addEventListener("fixture-remove", remove);
    window.addEventListener("fixture-listbox", listbox);
    return () => {
      window.removeEventListener("fixture-remove", remove);
      window.removeEventListener("fixture-listbox", listbox);
    };
  }, []);
  return (
    <main className="fixture-task">
      <p>Synthetic fixture. No installed plugin or live records.</p>
      <h1>Task investigation</h1>
      <label>
        Task draft
        <input aria-label="Task draft" defaultValue="Unfinished draft" />
      </label>
      <p>
        Workflow remains todo. <output aria-label="Task shortcut count">{shortcuts}</output>
      </p>
      <section className="fixture-editor" aria-label="Editor sentinel">
        <h2>Editor heading</h2>
        <p>
          Editor text with <code className="token keyword">const editor</code>.
        </p>
      </section>
      <section className="fixture-chat" aria-label="Chat sentinel">
        <h2>Chat heading</h2>
        <pre>
          <code className="token comment">Chat code</code>
        </pre>
        <table>
          <tbody>
            <tr>
              <td>Chat table</td>
            </tr>
          </tbody>
        </table>
      </section>
      <button ref={fallback}>Attach file</button>
      <AttachmentsGrid
        attachments={attachments}
        onPreview={preview.open}
        onRemove={async (item) => {
          preview.removed(item.id);
          setAttachments([]);
        }}
        onError={() => {}}
      />
      {preview.dialog}
      {choices ? (
        <div role="listbox" aria-label="Newer choices" tabIndex={0}>
          <div role="option" aria-selected="true">
            Selected choice
          </div>
        </div>
      ) : null}
    </main>
  );
}
function Fixture() {
  const root = useRef<HTMLDivElement>(null);
  return (
    <div ref={root}>
      <ShortcutProvider rootRef={root}>
        <TaskFixture />
      </ShortcutProvider>
    </div>
  );
}
renderSlot(
  {
    component: () => (
      <StrictMode>
        <Fixture />
      </StrictMode>
    ),
  },
  {},
  {
    openUrl: (url) => {
      document.documentElement.dataset.openedUrl = url;
      document.documentElement.dataset.urlOpens = String(
        Number(document.documentElement.dataset.urlOpens || 0) + 1,
      );
      return new URLSearchParams(location.search).get("open") !== "fail";
    },
  },
);
