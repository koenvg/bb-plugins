import * as fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTasksStore } from "../db";
import { registerAttachments, saveAttachmentFromBytes } from ".";

vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof fs>();
  return { ...actual, open: vi.fn(actual.open) };
});
afterEach(() => vi.mocked(fs.open).mockReset());

function setup() {
  const { bb, harness } = createFakePluginHost({ pluginId: "tasks" });
  const database = bb.storage.database();
  const store = createTasksStore(database);
  const project = store.createProject({ name: "Preview", prefix: "PRE", color: "blue" });
  const task = store.createTask({ projectId: project.id, title: "Generic preview owner" });
  const route = vi.spyOn(bb.http, "route");
  registerAttachments(bb, store);
  const root = dirname(
    database.prepare<[], { file: string }>("PRAGMA database_list").all()[0]!.file,
  );
  return { bb, harness, store, task, root, route };
}

async function realOpen() {
  const actual = await vi.importActual<typeof fs>("node:fs/promises");
  vi.mocked(fs.open).mockImplementation(actual.open);
  return actual;
}

describe("registered saved attachment preview", () => {
  it.each(["notes.md", "NOTES.MD", "notes.MarkDown", "NOTES.MARKDOWN"])(
    "accepts %s with generic MIME and exact source",
    async (fileName) => {
      await realOpen();
      const { harness, store, task } = setup();
      try {
        const text = "\uFEFF---\r\ntitle: notes\r\n---\r\n\r\n\tcode  \r\n";
        const bytes = Buffer.from(text);
        const attachment = await saveAttachmentFromBytes(store, bytes, {
          taskId: task.id,
          fileName,
          mime: "application/octet-stream",
        });
        const response = await harness.fetchHttp(
          "GET",
          `/attachments/preview?attachmentId=${attachment.id}`,
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          attachmentId: attachment.id,
          fileName,
          byteSize: bytes.length,
          text,
        });
        const download = await harness.fetchHttp(
          "GET",
          `/attachments/download?attachmentId=${attachment.id}`,
        );
        expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
        expect(download.headers.get("content-disposition")).toBe(
          `attachment; filename="${fileName}"; filename*=UTF-8''${fileName}`,
        );
        expect(download.headers.get("x-content-type-options")).toBe("nosniff");
      } finally {
        await harness.dispose();
      }
    },
  );

  it("registers explicit local auth, not an anonymous endpoint", async () => {
    const { harness, route } = setup();
    try {
      expect(
        route.mock.calls.find((call) => call[1] === "/attachments/preview")?.slice(0, 2),
      ).toEqual(["GET", "/attachments/preview"]);
      expect(route.mock.calls.find((call) => call[1] === "/attachments/preview")?.[3]).toEqual({
        auth: "local",
      });
    } finally {
      await harness.dispose();
    }
  });

  it.each([
    "",
    "?path=/etc/passwd",
    "?attachmentId=../secret",
    "?attachmentId=a&source=file",
    "?attachmentId=a&attachmentId=b",
    `?attachmentId=${"a".repeat(129)}`,
  ])("rejects non-ID input %s", async (query) => {
    const { harness } = setup();
    try {
      const response = await harness.fetchHttp("GET", `/attachments/preview${query}`);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: { code: "invalid-request" } });
    } finally {
      await harness.dispose();
    }
  });

  it("returns bounded missing/blob/confinement errors and image priority", async () => {
    await realOpen();
    const { harness, store, task } = setup();
    try {
      const missing = await harness.fetchHttp("GET", "/attachments/preview?attachmentId=missing");
      expect(await missing.json()).toEqual({ error: { code: "missing" } });
      for (const [fileName, mime] of [
        ["picture.md", "image/png"],
        ["notes.txt", "text/plain"],
      ]) {
        const attachment = await saveAttachmentFromBytes(store, Buffer.from("hello"), {
          taskId: task.id,
          fileName,
          mime,
        });
        const response = await harness.fetchHttp(
          "GET",
          `/attachments/preview?attachmentId=${attachment.id}`,
        );
        expect(response.status).toBe(415);
        expect(await response.json()).toEqual({ error: { code: "unsupported" } });
      }
      const attachment = store.createAttachment({
        taskId: task.id,
        fileName: "missing.md",
        mime: "text/plain",
        sizeBytes: 0,
        blobPath: "blobs/absent",
        isImage: false,
      });
      expect(
        await (
          await harness.fetchHttp("GET", `/attachments/preview?attachmentId=${attachment.id}`)
        ).json(),
      ).toEqual({ error: { code: "missing" } });
      vi.spyOn(store, "getAttachment").mockReturnValueOnce({
        ...attachment,
        blobPath: "../secret",
      });
      expect(
        await (
          await harness.fetchHttp("GET", `/attachments/preview?attachmentId=${attachment.id}`)
        ).json(),
      ).toEqual({ error: { code: "failed" } });
    } finally {
      await harness.dispose();
    }
  });

  it.each([
    Buffer.from([0xc3, 0x28]),
    Buffer.from("a\0b"),
    Buffer.from("a\u000bb"),
    Buffer.from("a\u007fb"),
    Buffer.from("a\u0085b"),
  ])("rejects invalid encoding or binary controls %j", async (bytes) => {
    await realOpen();
    const { harness, store, task } = setup();
    try {
      const attachment = await saveAttachmentFromBytes(store, bytes, {
        taskId: task.id,
        fileName: "bad.md",
      });
      const response = await harness.fetchHttp(
        "GET",
        `/attachments/preview?attachmentId=${attachment.id}`,
      );
      expect(response.status).toBe(415);
      expect(await response.json()).toEqual({ error: { code: "unsupported" } });
    } finally {
      await harness.dispose();
    }
  });

  it.each([0, 1024 * 1024, 1024 * 1024 + 1])(
    "enforces actual %i bytes and keeps original downloads",
    async (size) => {
      await realOpen();
      const { harness, store, task } = setup();
      try {
        const bytes = Buffer.alloc(size, 65);
        const attachment = await saveAttachmentFromBytes(store, bytes, {
          taskId: task.id,
          fileName: "large.md",
        });
        store.updateAttachment(attachment.id, { sizeBytes: 0 });
        const response = await harness.fetchHttp(
          "GET",
          `/attachments/preview?attachmentId=${attachment.id}`,
        );
        expect(response.status).toBe(size > 1024 * 1024 ? 413 : 200);
        expect(await response.json()).toEqual(
          size > 1024 * 1024
            ? { error: { code: "too-large" } }
            : {
                attachmentId: attachment.id,
                fileName: "large.md",
                byteSize: size,
                text: "A".repeat(size),
              },
        );
        store.updateAttachment(attachment.id, { sizeBytes: size });
        const download = await harness.fetchHttp(
          "GET",
          `/attachments/download?attachmentId=${attachment.id}`,
        );
        expect(download.headers.get("content-length")).toBe(String(size));
        expect(download.headers.get("content-type")).toBe("application/octet-stream");
        expect(download.headers.get("content-disposition")).toBe(
          "attachment; filename=\"large.md\"; filename*=UTF-8''large.md",
        );
        expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
      } finally {
        await harness.dispose();
      }
    },
  );

  it("rejects growth during short reads, bounds bytes, and closes its one descriptor", async () => {
    const actual = await realOpen();
    const { harness, store, task, root } = setup();
    try {
      const attachment = await saveAttachmentFromBytes(store, Buffer.from("A"), {
        taskId: task.id,
        fileName: "growing.md",
      });
      const handle = await actual.open(join(root, attachment.blobPath), "r");
      const read = handle.read.bind(handle);
      const close = vi.spyOn(handle, "close");
      let requested = 0;
      let first = true;
      vi.spyOn(handle, "read").mockImplementation(
        async (...args: Parameters<typeof handle.read>) => {
          const [buffer, offset, length, position] = args as unknown as [
            Buffer,
            number,
            number,
            number,
          ];
          requested = Math.max(requested, offset + length);
          if (first) {
            first = false;
            await actual.writeFile(
              join(root, attachment.blobPath),
              Buffer.alloc(1024 * 1024 + 100, 65),
            );
          }
          return read(buffer, offset, Math.min(length, 17_000), position);
        },
      );
      vi.mocked(fs.open).mockResolvedValueOnce(handle);
      const response = await harness.fetchHttp(
        "GET",
        `/attachments/preview?attachmentId=${attachment.id}`,
      );
      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({ error: { code: "too-large" } });
      expect(requested).toBe(1024 * 1024 + 1);
      expect(close.mock.calls.length).toBe(1);
    } finally {
      await harness.dispose();
    }
  });
});
