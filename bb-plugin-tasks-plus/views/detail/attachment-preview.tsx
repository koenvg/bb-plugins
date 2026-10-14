import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  MarkdownDocument,
  denyDestinations,
  type DocumentView,
} from "@bb-plugins/markdown-document";
import "@bb-plugins/markdown-document/style.css";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import type { Attachment } from "../../shared/contract";
import { hasOpenOverlay } from "../../shell/shortcuts";
import {
  attachmentDownloadUrl,
  attachmentPreviewUrl,
  MAX_ATTACHMENT_PREVIEW_BYTES,
  hasBinaryTextControls,
} from "../../shared/attachments";
import "./attachment-preview.css";

type PreviewSnapshot = Readonly<{
  attachmentId: string;
  fileName: string;
  byteSize: number;
  text: string;
}>;
type PreviewFault = "missing" | "denied" | "unsupported" | "too-large" | "failed";
type Resource =
  | { kind: "loading" }
  | { kind: "ready"; snapshot: PreviewSnapshot }
  | { kind: "failure"; fault: PreviewFault };
type Ticket = {
  sequence: number;
  attachmentId: string;
  taskId: string;
  controller: AbortController;
};
type FocusSession = { token: number; trigger: HTMLElement };
type PreviewState =
  | { kind: "closed" }
  | {
      kind: "open";
      taskId: string;
      subject: Attachment;
      sequence: number;
      session: FocusSession;
      view: DocumentView;
      resource: Resource;
    };

const messages: Record<PreviewFault, string> = {
  missing: "This attachment is no longer available. You can try again or use Download.",
  denied: "You do not have access to this preview. You can try again or use Download.",
  unsupported:
    "This attachment cannot be shown as UTF-8 Markdown. Use Download for the original file.",
  "too-large": "Preview is limited to 1 MiB. Use Download for the original file.",
  failed: "The preview could not load. Try again or use Download.",
};

async function loadPreview(subject: Attachment, signal: AbortSignal): Promise<Resource> {
  try {
    const response = await fetch(attachmentPreviewUrl(subject.id), { signal });
    if (!response.ok) {
      await response.body?.cancel();
      return {
        kind: "failure",
        fault:
          response.status === 404
            ? "missing"
            : response.status === 401 || response.status === 403
              ? "denied"
              : response.status === 413
                ? "too-large"
                : response.status === 415
                  ? "unsupported"
                  : "failed",
      };
    }
    const limit = MAX_ATTACHMENT_PREVIEW_BYTES * 6 + 4096;
    if (Number(response.headers.get("content-length")) > limit || !response.body) {
      await response.body?.cancel();
      throw new Error("invalid body");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit || signal.aborted) {
          await reader.cancel();
          throw new Error("bounded body");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const json: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!json || typeof json !== "object") throw new Error("invalid snapshot");
    const data = json as Record<string, unknown>;
    if (
      data.attachmentId !== subject.id ||
      data.fileName !== subject.fileName ||
      new TextEncoder().encode(subject.fileName).byteLength > 180 ||
      typeof data.text !== "string" ||
      typeof data.byteSize !== "number" ||
      !Number.isSafeInteger(data.byteSize) ||
      data.byteSize < 0 ||
      data.byteSize > MAX_ATTACHMENT_PREVIEW_BYTES ||
      new TextEncoder().encode(data.text).byteLength !== data.byteSize ||
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        new TextEncoder().encode(data.text),
      ) !== data.text ||
      hasBinaryTextControls(data.text)
    )
      throw new Error("invalid snapshot");
    return {
      kind: "ready",
      snapshot: Object.freeze({
        attachmentId: subject.id,
        fileName: subject.fileName,
        byteSize: data.byteSize,
        text: data.text,
      }),
    };
  } catch {
    return { kind: "failure", fault: "failed" };
  }
}

function usable(element: HTMLElement | null): element is HTMLElement {
  if (
    element === null ||
    !element.isConnected ||
    element.matches(":disabled") ||
    element.closest('[hidden], [inert], [aria-hidden="true"]') !== null
  )
    return false;
  for (
    let current: HTMLElement | null = element;
    current !== null;
    current = current.parentElement
  ) {
    const style = getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden") return false;
  }
  return true;
}

export function useAttachmentPreview({
  taskId,
  confirmedAttachments,
  fallbackRef,
}: {
  taskId: string;
  confirmedAttachments: readonly Attachment[] | undefined;
  fallbackRef: RefObject<HTMLElement | null>;
}) {
  const [state, setState] = useState<PreviewState>({ kind: "closed" });
  const runtime = useRef({
    mounted: false,
    taskId,
    sequence: 0,
    focusToken: 0,
    ticket: null as Ticket | null,
    session: null as FocusSession | null,
    closedSession: null as FocusSession | null,
  });
  const panel = useRef<HTMLDivElement>(null);
  const invalidate = () => {
    const owner = runtime.current;
    const previous = owner.ticket;
    owner.ticket = null;
    owner.sequence++;
    previous?.controller.abort();
  };
  const close = () => {
    invalidate();
    runtime.current.closedSession = runtime.current.session;
    runtime.current.session = null;
    setState({ kind: "closed" });
  };
  useLayoutEffect(() => {
    const owner = runtime.current;
    owner.mounted = true;
    owner.taskId = taskId;
    return () => {
      owner.mounted = false;
      owner.session = null;
      owner.closedSession = null;
      invalidate();
    };
  }, [taskId]);
  useLayoutEffect(() => {
    if (
      state.kind === "open" &&
      (state.taskId !== taskId ||
        (confirmedAttachments !== undefined &&
          !confirmedAttachments.some((attachment) => attachment.id === state.subject.id)))
    )
      close();
  }, [taskId, confirmedAttachments, state]);

  const start = (subject: Attachment, session: FocusSession) => {
    invalidate();
    const owner = runtime.current;
    const ticket: Ticket = {
      sequence: owner.sequence,
      attachmentId: subject.id,
      taskId,
      controller: new AbortController(),
    };
    owner.ticket = ticket;
    setState({
      kind: "open",
      taskId,
      subject,
      sequence: ticket.sequence,
      session,
      view: "preview",
      resource: { kind: "loading" },
    });
    void loadPreview(subject, ticket.controller.signal).then((resource) => {
      const current = runtime.current;
      if (!current.mounted || current.ticket !== ticket || current.taskId !== ticket.taskId) return;
      setState((value) =>
        current.ticket === ticket &&
        value.kind === "open" &&
        value.sequence === ticket.sequence &&
        value.subject.id === ticket.attachmentId &&
        value.taskId === ticket.taskId
          ? { ...value, resource }
          : value,
      );
    });
  };
  const open = (subject: Attachment, trigger: HTMLElement) => {
    const owner = runtime.current;
    const session = { token: ++owner.focusToken, trigger };
    owner.session = session;
    owner.closedSession = null;
    start(subject, session);
  };
  const removed = (id: string) => {
    if (runtime.current.ticket?.attachmentId === id) close();
  };
  const focusToken =
    state.kind === "open" ? state.session.token : runtime.current.closedSession?.token;
  const restoreFocus = () => {
    const owner = runtime.current;
    const session = owner.closedSession;
    if (!owner.mounted || owner.session || !session || session.token !== focusToken) return;
    queueMicrotask(() => {
      if (!owner.mounted || owner.session || owner.closedSession !== session) return;
      if (hasOpenOverlay(panel.current)) return;
      const target = usable(session.trigger) ? session.trigger : fallbackRef.current;
      if (usable(target)) target.focus({ preventScroll: true });
      owner.closedSession = null;
    });
  };
  const active = state.kind === "open" ? state : null;
  const setView = (view: DocumentView) =>
    setState((current) => (current.kind === "open" ? { ...current, view } : current));
  return {
    open,
    removed,
    dialog: (
      <Dialog
        open={active !== null}
        onOpenChange={(value) => {
          if (!value) close();
        }}
      >
        <DialogContent
          ref={panel}
          className="attachment-preview"
          hideCloseButton
          onCloseAutoFocus={(event) => event.preventDefault()}
          onAfterCloseAutoFocus={restoreFocus}
        >
          <header className="attachment-preview-header">
            <DialogTitle className="attachment-preview-title">
              {active?.subject.fileName ?? "Attachment preview"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Read-only Markdown attachment. Download keeps the original file.
            </DialogDescription>
            <div className="attachment-preview-toolbar" aria-label="Document controls">
              <div className="attachment-preview-views" role="group" aria-label="Document view">
                <Button
                  variant="ghost"
                  aria-pressed={active?.view === "preview"}
                  onClick={() => setView("preview")}
                >
                  Preview
                </Button>
                <Button
                  variant="ghost"
                  aria-pressed={active?.view === "raw"}
                  onClick={() => setView("raw")}
                >
                  Raw
                </Button>
              </div>
              <Button variant="outline" asChild>
                <a
                  href={attachmentDownloadUrl(active?.subject.id ?? "")}
                  download={active?.subject.fileName}
                >
                  Download
                </a>
              </Button>
              <Button variant="outline" onClick={close}>
                Close
              </Button>
            </div>
          </header>
          <section
            className="attachment-preview-body"
            aria-label="Document"
            aria-busy={active?.resource.kind === "loading"}
          >
            {active?.resource.kind === "loading" ? (
              <p role="status">Loading Markdown preview…</p>
            ) : null}
            {active?.resource.kind === "failure" ? (
              <div role="status">
                <p>{messages[active.resource.fault]}</p>
                {["failed", "missing", "denied"].includes(active.resource.fault) ? (
                  <Button variant="outline" onClick={() => start(active.subject, active.session)}>
                    Retry
                  </Button>
                ) : null}
              </div>
            ) : null}
            {active?.resource.kind === "ready" ? (
              active.resource.snapshot.text === "" && active.view === "preview" ? (
                <p role="status">This file is empty. Download keeps the original file.</p>
              ) : (
                <MarkdownDocument
                  text={active.resource.snapshot.text}
                  view={active.view}
                  namespace={`task-${taskId}-${active.subject.id}`}
                  destinations={denyDestinations}
                />
              )
            ) : null}
          </section>
        </DialogContent>
      </Dialog>
    ),
  };
}
