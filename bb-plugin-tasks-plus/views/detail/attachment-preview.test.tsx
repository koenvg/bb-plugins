// @vitest-environment jsdom
import { StrictMode, useRef } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAttachmentPreview } from "./attachment-preview";
import { AttachmentsGrid } from "./attachments";
import type { Attachment } from "../../shared/contract";
import { CompactViewportOverrideProvider } from "../../components/ui/hooks/use-compact-viewport";
import { Dialog, DialogContent, DialogTitle } from "../../components/ui/dialog";

const a: Attachment = {
  id: "attachment-a",
  taskId: "task-a",
  fileName: "NOTES.MARKDOWN",
  mime: "application/octet-stream",
  sizeBytes: 12,
  isImage: false,
  createdAt: "2026-07-20T00:00:00.000Z",
};
const b: Attachment = { ...a, id: "attachment-b", fileName: "other.md" };
const pending: { resolve: (response: Response) => void; signal: AbortSignal; url: string }[] = [];
function deferredFetch() {
  pending.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url, options) =>
        new Promise<Response>((resolve) =>
          pending.push({ resolve, signal: options.signal, url: String(url) }),
        ),
    ),
  );
}
function reply(item: Attachment, text: string, extra = {}) {
  return Response.json({
    attachmentId: item.id,
    fileName: item.fileName,
    byteSize: new TextEncoder().encode(text).byteLength,
    text,
    ...extra,
  });
}
async function resolve(index: number, response: Response) {
  await act(async () => pending[index]!.resolve(response));
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Fixture({
  taskId = "task-a",
  confirmed,
  compact = false,
  another = false,
  listbox = false,
}: {
  taskId?: string;
  confirmed?: Attachment[];
  compact?: boolean;
  another?: boolean;
  listbox?: boolean;
}) {
  const fallback = useRef<HTMLButtonElement>(null);
  const preview = useAttachmentPreview({
    taskId,
    confirmedAttachments: confirmed,
    fallbackRef: fallback,
  });
  return (
    <CompactViewportOverrideProvider isCompactViewport={compact}>
      <button ref={fallback}>Task control</button>
      <input aria-label="Draft" defaultValue="unfinished" />
      <AttachmentsGrid
        attachments={confirmed ?? [a, b]}
        onPreview={preview.open}
        onRemove={async (item) => preview.removed(item.id)}
        onError={() => {}}
      />
      <button onClick={() => preview.open(a, fallback.current!)}>Replace with A</button>
      <button onClick={() => preview.open(b, fallback.current!)}>Replace with B</button>
      <button onClick={() => preview.removed(a.id)}>Confirm removed A</button>
      {preview.dialog}
      {listbox ? (
        <div role="listbox" aria-label="Newer choices" tabIndex={0}>
          <div role="option" aria-selected="true">
            Selected choice
          </div>
        </div>
      ) : null}
      {another ? (
        <Dialog open>
          <DialogContent>
            <DialogTitle>Newer overlay</DialogTitle>
            <button>Newer action</button>
          </DialogContent>
        </Dialog>
      ) : null}
    </CompactViewportOverrideProvider>
  );
}
function mount(props: Parameters<typeof Fixture>[0] = {}) {
  return render(
    <StrictMode>
      <Fixture {...props} />
    </StrictMode>,
  );
}
function openA() {
  fireEvent.click(screen.getByRole("button", { name: a.fileName }));
}
function close() {
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
}

describe("task-scoped attachment owner", () => {
  it("starts Preview, shares exact immutable Raw without refetch/write, and retains original download", async () => {
    deferredFetch();
    mount();
    openA();
    expect(screen.getByRole("status").textContent).toBe("Loading Markdown preview…");
    expect(screen.getByRole("link", { name: "Download" }).getAttribute("href")).toBe(
      "/api/v1/plugins/tasks-plus/http/attachments/download?attachmentId=attachment-a",
    );
    const text =
      "\uFEFF---\r\ntitle: notes\r\n---\r\n\r\n# Notes\r\n\r\n```unknown\r\n\tx  \r\n```\r\n";
    await resolve(0, reply(a, text));
    expect(screen.getByRole("heading", { name: "Notes", level: 1 }).textContent).toBe("Notes");
    expect(screen.getByRole("button", { name: "Preview" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Raw" }));
    expect(screen.getByLabelText("Raw source").textContent).toBe(text);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(pending.map(({ url }) => url)).toEqual([
      "/api/v1/plugins/tasks-plus/http/attachments/preview?attachmentId=attachment-a",
    ]);
    expect(screen.getByLabelText("Draft").getAttribute("value")).toBe("unfinished");
    close();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("discards late responses after close, replacement and A to B to A", async () => {
    deferredFetch();
    mount();
    openA();
    close();
    expect(pending[0]!.signal.aborted).toBe(true);
    await resolve(0, reply(a, "# obsolete"));
    expect(screen.queryByRole("dialog")).toBeNull();
    openA();
    fireEvent.click(screen.getByText("Replace with B"));
    fireEvent.click(screen.getByText("Replace with A"));
    await resolve(3, reply(a, "# current"));
    await resolve(2, reply(b, "# wrong B"));
    await resolve(1, reply(a, "# old A"));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("current");
    expect(pending.slice(0, 3).map((request) => request.signal.aborted)).toEqual([
      true,
      true,
      true,
    ]);
  });
  it.each([false, true])("Retry keeps its original focus session, compact=%s", async (compact) => {
    deferredFetch();
    mount({ compact });
    const trigger = screen.getByRole("button", { name: a.fileName });
    trigger.focus();
    openA();
    await resolve(0, new Response("", { status: 500 }));
    expect((await screen.findByRole("status")).textContent).toContain(
      "The preview could not load.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(pending[0]!.signal.aborted).toBe(true);
    await resolve(1, reply(a, "# Retried"));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Retried");
    close();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
  it.each(["close", "replacement"])(
    "rejects a deferred Retry response after %s without replacing content or focus",
    async (invalidation) => {
      deferredFetch();
      mount();
      const trigger = screen.getByRole("button", { name: a.fileName });
      trigger.focus();
      openA();
      await resolve(0, new Response("", { status: 500 }));
      expect(screen.getByRole("status").textContent).toContain("The preview could not load.");
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(screen.getByRole("status").textContent).toBe("Loading Markdown preview…");
      if (invalidation === "close") {
        close();
        await waitFor(() => expect(document.activeElement).toBe(trigger));
      }
      fireEvent.click(screen.getByText("Replace with B"));
      expect(pending[1]!.signal.aborted).toBe(true);
      await resolve(2, reply(b, "# Current B"));
      const dialog = screen.getByRole("dialog", { name: b.fileName });
      const target = within(dialog).getByRole("button", { name: "Raw" });
      target.focus();
      await resolve(1, reply(a, "# Obsolete retry A"));
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Current B");
      expect(screen.getByRole("dialog", { name: b.fileName })).toBe(dialog);
      expect(screen.queryByText("Obsolete retry A")).toBeNull();
      expect(document.activeElement).toBe(target);
      fireEvent.click(target);
      expect(screen.getByLabelText("Raw source").textContent).toBe("# Current B");
      expect(pending.map(({ url }) => url)).toEqual([
        "/api/v1/plugins/tasks-plus/http/attachments/preview?attachmentId=attachment-a",
        "/api/v1/plugins/tasks-plus/http/attachments/preview?attachmentId=attachment-a",
        "/api/v1/plugins/tasks-plus/http/attachments/preview?attachmentId=attachment-b",
      ]);
    },
  );
  it.each([401, 403, 404, 413, 415, 500])(
    "shows bounded %s failure and keeps original ID Download",
    async (status) => {
      deferredFetch();
      mount();
      openA();
      await resolve(0, new Response("private path ignored", { status }));
      expect(screen.getByRole("status").textContent).toContain(
        status === 401 || status === 403
          ? "do not have access"
          : status === 404
            ? "no longer available"
            : status === 413
              ? "1 MiB"
              : status === 415
                ? "UTF-8"
                : "could not load",
      );
      expect(screen.getByRole("link", { name: "Download" }).getAttribute("download")).toBe(
        "NOTES.MARKDOWN",
      );
      expect(screen.queryByRole("button", { name: "Retry" }) !== null).toBe(
        ![413, 415].includes(status),
      );
    },
  );
  it("represents empty text and an exact empty Raw", async () => {
    deferredFetch();
    mount();
    openA();
    await resolve(0, reply(a, ""));
    expect(screen.getByRole("status").textContent).toBe(
      "This file is empty. Download keeps the original file.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Raw" }));
    expect(screen.getByLabelText("Raw source").textContent).toBe("");
  });
  it.each([
    { attachmentId: "other" },
    { fileName: "other.md" },
    { byteSize: 0 },
    { byteSize: 1024 * 1024 + 1 },
    { text: "\0" },
  ])("validates response identity and bytes %j before rendering", async (extra) => {
    deferredFetch();
    mount();
    openA();
    await resolve(0, reply(a, "# forbidden", extra));
    expect(screen.getByRole("status").textContent).toContain("could not load");
    expect(screen.queryByRole("heading", { name: "forbidden" })).toBeNull();
  });
  it("bounds streamed JSON escaping allowance and cancels oversize before parsing", async () => {
    deferredFetch();
    mount();
    openA();
    const cancel = vi.fn();
    await resolve(
      0,
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(6 * 1024 * 1024 + 4097));
          },
          cancel,
        }),
      ),
    );
    expect(screen.getByRole("status").textContent).toContain("could not load");
    expect(cancel.mock.calls.length).toBe(1);
  });
  it("accepts the full UTF-8 source boundary with escaped JSON and cancels oversized declared bodies", async () => {
    deferredFetch();
    mount();
    openA();
    const text = "\t".repeat(1024 * 1024);
    await resolve(0, reply(a, text));
    fireEvent.click(screen.getByRole("button", { name: "Raw" }));
    expect(screen.getByLabelText("Raw source").textContent).toBe(text);
    close();
    openA();
    const cancel = vi.fn();
    await resolve(
      1,
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(1));
          },
          cancel,
        }),
        { headers: { "content-length": String(6 * 1024 * 1024 + 4097) } },
      ),
    );
    expect(screen.getByRole("status").textContent).toContain("could not load");
    expect(cancel.mock.calls.length).toBe(1);
  });
  it.each([false, true])(
    "rapid reopen does not let obsolete dismissal restore focus, compact=%s",
    async (compact) => {
      deferredFetch();
      mount({ compact });
      openA();
      await resolve(0, reply(a, "# Initial"));
      await screen.findByRole("heading", { name: "Initial", level: 1 });
      close();
      fireEvent.click(screen.getByText("Replace with B"));
      await resolve(1, reply(b, "# Current"));
      const heading = await screen.findByRole("heading", { name: "Current", level: 1 });
      const dialog = heading.closest('[role="dialog"]')!;
      const target = within(dialog as HTMLElement).getByRole("button", { name: "Raw" });
      target.focus();
      await act(async () => {});
      expect(document.activeElement).toBe(target);
      expect(screen.getByRole("heading", { name: b.fileName }).textContent).toBe(b.fileName);
    },
  );
  it.each([false, true])(
    "uses stable fallback when the connected trigger has a hidden ancestor, compact=%s",
    async (compact) => {
      deferredFetch();
      mount({ compact });
      const trigger = screen.getByRole("button", { name: a.fileName });
      openA();
      await resolve(0, reply(a, "# Ready"));
      await screen.findByRole("heading", { name: "Ready", level: 1 });
      trigger.parentElement!.style.display = "none";
      close();
      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "Task control" })),
      );
    },
  );
  it("closes only on confirmed removal, not undefined loading/error data", async () => {
    deferredFetch();
    const view = mount();
    openA();
    view.rerender(
      <StrictMode>
        <Fixture confirmed={undefined} />
      </StrictMode>,
    );
    expect(screen.getByRole("dialog", { name: a.fileName }).textContent).toContain(
      "Loading Markdown preview",
    );
    await resolve(0, reply(a, "# Saved"));
    view.rerender(
      <StrictMode>
        <Fixture confirmed={[]} />
      </StrictMode>,
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(pending[0]!.signal.aborted).toBe(true);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Task control" })),
    );
  });
  it("invalidates pending reads on successful deletion, task replacement and unmount", async () => {
    deferredFetch();
    const view = mount();
    openA();
    fireEvent.click(screen.getByText("Confirm removed A"));
    await resolve(0, reply(a, "# removed"));
    expect(screen.queryByRole("dialog")).toBeNull();
    openA();
    view.rerender(
      <StrictMode>
        <Fixture taskId="task-b" />
      </StrictMode>,
    );
    expect(pending[1]!.signal.aborted).toBe(true);
    await resolve(1, reply(a, "# wrong task"));
    expect(screen.queryByRole("dialog")).toBeNull();
    openA();
    view.unmount();
    expect(pending[2]!.signal.aborted).toBe(true);
    await resolve(2, reply(a, "# unmounted"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it.each([false, true])(
    "does not steal newer listbox focus during deferred dismissal, compact=%s",
    async (compact) => {
      deferredFetch();
      const view = mount({ compact });
      openA();
      await resolve(0, reply(a, "# Notes"));
      await screen.findByRole("heading", { name: "Notes", level: 1 });
      close();
      view.rerender(
        <StrictMode>
          <Fixture compact={compact} listbox />
        </StrictMode>,
      );
      const target = screen.getByRole("listbox", { name: "Newer choices" });
      target.focus();
      await act(async () => {});
      expect(document.activeElement).toBe(target);
    },
  );
  it.each([false, true])(
    "does not restore obsolete focus into a newer overlay, compact=%s",
    async (compact) => {
      deferredFetch();
      const view = mount({ compact });
      openA();
      await resolve(0, reply(a, "# Notes"));
      await screen.findByRole("heading", { name: "Notes", level: 1 });
      close();
      view.rerender(
        <StrictMode>
          <Fixture compact={compact} another />
        </StrictMode>,
      );
      const dialog = await screen.findByRole("dialog", { name: "Newer overlay" });
      const target = within(dialog).getByRole("button", { name: "Newer action" });
      target.focus();
      await act(async () => {
        await new Promise((done) => setTimeout(done, 30));
      });
      expect(document.activeElement).toBe(target);
    },
  );
});

describe("saved file activation", () => {
  it.each(["a.md", "A.MD", "a.markdown", "A.MARKDOWN"])(
    "opens %s with generic MIME",
    async (fileName) => {
      deferredFetch();
      const item = { ...a, fileName };
      const fallback = { current: null };
      function Cards() {
        const preview = useAttachmentPreview({
          taskId: "task-a",
          confirmedAttachments: [item],
          fallbackRef: fallback,
        });
        return (
          <>
            <AttachmentsGrid
              attachments={[item]}
              onPreview={preview.open}
              onRemove={async () => {}}
              onError={() => {}}
            />
            {preview.dialog}
          </>
        );
      }
      render(<Cards />);
      fireEvent.click(screen.getByRole("button", { name: fileName }));
      await resolve(0, reply(item, "# eligible"));
      expect(screen.getByRole("dialog").textContent).toContain("eligible");
    },
  );
  it("retains non-Markdown download, image priority and removal actions", () => {
    const onPreview = vi.fn();
    render(
      <AttachmentsGrid
        attachments={[
          { ...a, fileName: "notes.pdf" },
          { ...b, fileName: "picture.md", isImage: true, mime: "image/png" },
        ]}
        onPreview={onPreview}
        onRemove={async () => {}}
        onError={() => {}}
      />,
    );
    expect(screen.getByRole("link", { name: /notes.pdf/ }).getAttribute("href")).toBe(
      "/api/v1/plugins/tasks-plus/http/attachments/download?attachmentId=attachment-a",
    );
    fireEvent.click(screen.getByAltText("picture.md"));
    expect(
      screen.getByRole("dialog", { name: "picture.md" }).querySelector("img")?.getAttribute("src"),
    ).toBe("/api/v1/plugins/tasks-plus/http/attachments/download?attachmentId=attachment-b");
    expect(onPreview.mock.calls.length).toBe(0);
    fireEvent.click(screen.getByLabelText("Remove picture.md"));
    expect(screen.getByRole("heading", { name: "Remove attachment?" }).textContent).toBe(
      "Remove attachment?",
    );
  });
});
