import { afterEach, expect, it } from "vitest";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

it("uploads attachments through the Tasks Plus token and HTTP routes", async () => {
  const requests: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith("/token")) {
      return new Response(JSON.stringify({ token: "test-token" }), { status: 200 });
    }
    if (url.includes("/attachments/upload")) {
      return new Response(JSON.stringify({ attachmentId: "att-1", url: "/download" }), {
        status: 201,
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const { uploadAttachment } = await import("./attachments.js");
  await uploadAttachment(new File(["data"], "note.txt", { type: "text/plain" }), {
    taskId: "task-1",
  });

  expect(requests).toEqual([
    "/api/v1/plugins/tasks-plus/token",
    "/api/v1/plugins/tasks-plus/http/attachments/upload?taskId=task-1&fileName=note.txt&mime=text%2Fplain",
  ]);
});
