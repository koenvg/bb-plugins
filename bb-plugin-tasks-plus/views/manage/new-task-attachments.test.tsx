// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { rpcInput } from "../../test-fixtures.js";
import { app, createdTask, PROJECT_ID, project, TASK_ID } from "./manage.test-support.js";

afterEach(cleanup);

describe("NewTaskDialog attachments", () => {
  const fetchCalls: string[] = [];
  const failFileNames = new Set<string>();
  let uploadGate: { fileName: string; promise: Promise<void> } | null = null;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchCalls.length = 0;
    failFileNames.clear();
    uploadGate = null;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/plugins/tasks-plus/token")) {
        return new Response(JSON.stringify({ token: "test-token" }), {
          status: 200,
        });
      }
      if (url.includes("/attachments/upload")) {
        fetchCalls.push(url);
        const query = new URL(url, "http://bb.test").searchParams;
        if (uploadGate && query.get("fileName") === uploadGate.fileName) {
          await uploadGate.promise;
        }
        return failFileNames.has(query.get("fileName") ?? "")
          ? new Response(JSON.stringify({ error: "disk full" }), {
              status: 500,
            })
          : new Response(JSON.stringify({ attachmentId: "att-1", url: "/download" }), {
              status: 201,
            });
      }
      return originalFetch(input, init);
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const dialogRpc = () => ({
    listProjects: () => ({ projects: [project] }),
    listFolders: () => ({ folders: [] }),
    listPresets: () => ({ presets: [] }),
    sidebarSummary: () => ({ projects: [] }),
    listTasks: () => ({ tasks: [] }),
    listLabels: () => ({ labels: [] }),
    createTask: (input: unknown) => ({
      ok: true,
      task: createdTask(rpcInput(input)),
    }),
  });

  const openDialogWithTitle = async (slot: ReturnType<typeof renderSlot>, title: string) => {
    fireEvent.click(await slot.findByRole("button", { name: /New task/ }));
    const titleInput = await slot.findByLabelText("Task title");
    fireEvent.change(titleInput, { target: { value: title } });
    return titleInput;
  };

  const pasteFile = (target: Element, file: File) =>
    fireEvent.paste(target, { clipboardData: { files: [file], types: [] } });

  it("uploads staged files to the created task and navigates on success", async () => {
    const slot = renderSlot(app.navPanels[0]!, { subPath: PROJECT_ID }, { rpc: dialogRpc() });
    const titleInput = await openDialogWithTitle(slot, "With files");
    pasteFile(titleInput, new File(["png"], "shot.png", { type: "image/png" }));
    await slot.findByText("shot.png");

    const picker = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(picker, {
      target: {
        files: [new File(["doc"], "notes.txt", { type: "text/plain" })],
      },
    });
    await slot.findByText("notes.txt");
    fireEvent.click(slot.getByRole("button", { name: "Remove notes.txt" }));
    expect(slot.queryByText("notes.txt")).toBeNull();

    fireEvent.click(slot.getByRole("button", { name: "Create task" }));
    await waitFor(() =>
      expect(slot.navigateCalls).toContainEqual({
        method: "toPluginPanel",
        path: "tasks",
        options: { subPath: "task/TSK-5" },
      }),
    );
    expect(fetchCalls).toHaveLength(1);
    const query = new URL(fetchCalls[0]!, "http://bb.test").searchParams;
    expect(query.get("taskId")).toBe(TASK_ID);
    expect(query.get("fileName")).toBe("shot.png");
  });

  it("recovers from a failed upload with a retryable chip bound to the created task", async () => {
    failFileNames.add("bad.bin");
    const slot = renderSlot(app.navPanels[0]!, { subPath: PROJECT_ID }, { rpc: dialogRpc() });
    const titleInput = await openDialogWithTitle(slot, "Partial failure");
    pasteFile(titleInput, new File(["ok"], "good.png", { type: "image/png" }));
    pasteFile(titleInput, new File(["nope"], "bad.bin", { type: "application/zip" }));
    await slot.findByText("bad.bin");

    fireEvent.click(slot.getByRole("button", { name: "Create task" }));
    const alert = await slot.findByRole("alert");
    expect(alert.textContent).toContain("was created, but 1 attachment failed to upload");
    expect(slot.navigateCalls).toEqual([]);
    expect(slot.queryByText("good.png")).toBeNull();

    failFileNames.clear();
    fireEvent.click(slot.getByRole("button", { name: "Retry upload of bad.bin" }));
    await waitFor(() =>
      expect(slot.navigateCalls).toContainEqual({
        method: "toPluginPanel",
        path: "tasks",
        options: { subPath: "task/TSK-5" },
      }),
    );
    const retryQuery = new URL(fetchCalls.at(-1)!, "http://bb.test").searchParams;
    expect(retryQuery.get("taskId")).toBe(TASK_ID);
    expect(retryQuery.get("fileName")).toBe("bad.bin");
  });

  it("blocks creation while an oversized file is staged, until it is removed", async () => {
    const slot = renderSlot(app.navPanels[0]!, { subPath: PROJECT_ID }, { rpc: dialogRpc() });
    const titleInput = await openDialogWithTitle(slot, "Too big");
    const big = new File(["x"], "big.bin", { type: "application/zip" });
    Object.defineProperty(big, "size", { value: 25 * 1024 * 1024 + 1 });
    pasteFile(titleInput, big);
    const chip = await slot.findByText("big.bin");
    expect(chip.closest("span")?.parentElement?.getAttribute("title")).toContain(
      "Over the 25 MB attachment limit",
    );

    await slot.findByText(/Remove attachments over the 25 MB limit/);
    const createButton = slot.getByRole("button", {
      name: "Create task",
    }) as HTMLButtonElement;
    expect(createButton.disabled).toBe(true);
    fireEvent.click(createButton);
    expect(slot.navigateCalls).toEqual([]);

    fireEvent.click(slot.getByRole("button", { name: "Remove big.bin" }));
    fireEvent.click(slot.getByRole("button", { name: "Create task" }));
    await waitFor(() =>
      expect(slot.navigateCalls).toContainEqual({
        method: "toPluginPanel",
        path: "tasks",
        options: { subPath: "task/TSK-5" },
      }),
    );
    expect(fetchCalls).toEqual([]);
  });

  it("freezes the attachment tray while create and uploads are in flight", async () => {
    let release!: () => void;
    uploadGate = {
      fileName: "slow.png",
      promise: new Promise((resolve) => (release = resolve)),
    };
    const slot = renderSlot(app.navPanels[0]!, { subPath: PROJECT_ID }, { rpc: dialogRpc() });
    const titleInput = await openDialogWithTitle(slot, "In flight");
    pasteFile(titleInput, new File(["x"], "slow.png", { type: "image/png" }));
    await slot.findByText("slow.png");

    fireEvent.click(slot.getByRole("button", { name: "Create task" }));
    await waitFor(() => expect(fetchCalls).toHaveLength(1));

    pasteFile(titleInput, new File(["y"], "late.txt", { type: "text/plain" }));
    expect(slot.queryByText("late.txt")).toBeNull();
    const removeButton = slot.getByRole("button", {
      name: "Remove slow.png",
    }) as HTMLButtonElement;
    expect(removeButton.disabled).toBe(true);
    fireEvent.click(removeButton);
    expect(slot.getByText("slow.png")).toBeDefined();

    release();
    await waitFor(() =>
      expect(slot.navigateCalls).toContainEqual({
        method: "toPluginPanel",
        path: "tasks",
        options: { subPath: "task/TSK-5" },
      }),
    );
    expect(fetchCalls).toHaveLength(1);
  });

  it("blocks accidental dismissal during recovery until skipped explicitly", async () => {
    failFileNames.add("bad.bin");
    const slot = renderSlot(app.navPanels[0]!, { subPath: PROJECT_ID }, { rpc: dialogRpc() });
    const titleInput = await openDialogWithTitle(slot, "Sticky recovery");
    pasteFile(titleInput, new File(["nope"], "bad.bin", { type: "application/zip" }));
    await slot.findByText("bad.bin");
    fireEvent.click(slot.getByRole("button", { name: "Create task" }));
    await slot.findByRole("alert");

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(slot.getByRole("alert")).toBeDefined();
    expect(slot.navigateCalls).toEqual([]);

    fireEvent.click(slot.getByRole("button", { name: "Skip attachments and open task" }));
    await waitFor(() =>
      expect(slot.navigateCalls).toContainEqual({
        method: "toPluginPanel",
        path: "tasks",
        options: { subPath: "task/TSK-5" },
      }),
    );
  });

  it("runs retry single-flight so double activation uploads exactly once", async () => {
    failFileNames.add("bad.bin");
    const slot = renderSlot(app.navPanels[0]!, { subPath: PROJECT_ID }, { rpc: dialogRpc() });
    const titleInput = await openDialogWithTitle(slot, "Retry once");
    pasteFile(titleInput, new File(["nope"], "bad.bin", { type: "application/zip" }));
    await slot.findByText("bad.bin");
    fireEvent.click(slot.getByRole("button", { name: "Create task" }));
    await slot.findByRole("alert");
    const attemptsBeforeRetry = fetchCalls.length;

    failFileNames.clear();
    let release!: () => void;
    uploadGate = {
      fileName: "bad.bin",
      promise: new Promise((resolve) => (release = resolve)),
    };
    const retryButton = slot.getByRole("button", {
      name: "Retry upload of bad.bin",
    });
    fireEvent.click(retryButton);
    fireEvent.click(retryButton);
    await slot.findByText("Retrying…");
    release();
    await waitFor(() =>
      expect(slot.navigateCalls).toContainEqual({
        method: "toPluginPanel",
        path: "tasks",
        options: { subPath: "task/TSK-5" },
      }),
    );
    expect(fetchCalls.length - attemptsBeforeRetry).toBe(1);
  });
});
