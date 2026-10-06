// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginRpcTestHandlers } from "@get-bb/plugin-sdk/testing/app";
import type { ProjectState, PromptResult, SettingsContract } from "./rpc";
import plugin from "./server";

const hosts: Array<ReturnType<typeof createFakePluginHost>["harness"]> = [];
afterEach(async () => {
  cleanup();
  while (hosts.length) await hosts.pop()!.lifecycle.dispose();
});
const choices = [
  { id: "proj_a", name: "Alpha" },
  { id: "proj_b", name: "Beta" },
];
const state = (projectId: string, prompt = "Loaded\n"): ProjectState => ({
  projectId,
  prompt,
  effectivePrompt: prompt,
  enabled: false,
  enabledOverride: null,
  enableByDefault: false,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
}
async function mount(overrides: Partial<PluginRpcTestHandlers<SettingsContract>> = {}) {
  const app = await loadPluginApp(() => import("./app"));
  return renderSlot<{}, SettingsContract>(
    app.settingsSections[0],
    {},
    {
      rpc: {
        listProjects: () => choices,
        getProject: ({ projectId }) => state(projectId),
        setEnablement: ({ projectId, enabledOverride }) => ({
          ...state(projectId),
          enabledOverride,
          enabled: enabledOverride ?? false,
        }),
        setPrompt: ({ projectId, prompt }) => ({
          status: "saved",
          state: state(projectId, prompt ?? "Factory"),
        }),
        ...overrides,
      },
    },
  );
}
async function select(view: Awaited<ReturnType<typeof mount>>, name = "Alpha") {
  const ui = within(view.container);
  await userEvent.selectOptions(
    await ui.findByRole("combobox"),
    await ui.findByRole("option", { name }),
  );
  await ui.findByRole("textbox");
  return ui;
}
async function edit(ui: ReturnType<typeof within>, text: string) {
  const editor = ui.getByRole("textbox") as HTMLTextAreaElement;
  await userEvent.clear(editor);
  await userEvent.click(editor);
  await userEvent.paste(text);
  return editor;
}
async function setupHost() {
  const host = createFakePluginHost({
    pluginId: "code-cleanup",
    sdk: {
      projects: {
        list: async () => choices.map((p) => ({ ...p, kind: "standard" })) as never,
      },
    },
  });
  hosts.push(host.harness);
  await plugin(host.bb);
  const call = host.harness.behavior.callRpc;
  const handlers: PluginRpcTestHandlers<SettingsContract> = {
    listProjects: async (input) => (await call("listProjects", input)) as typeof choices,
    getProject: async (input) => (await call("getProject", input)) as ProjectState,
    setEnablement: async (input) => (await call("setEnablement", input)) as ProjectState,
    setPrompt: async (input) => (await call("setPrompt", input)) as PromptResult,
  };
  return { host, handlers };
}

describe("Settings invalidation and conflict recovery", () => {
  it("keeps two clients current after UI and CLI writes, without replacing a dirty baseline", async () => {
    const { host, handlers } = await setupHost();
    const a = await mount(handlers);
    const b = await mount(handlers);
    const uiA = await select(a);
    const uiB = await select(b);
    const draftA = await edit(uiA, "Client A\n");
    const draftB = await edit(uiB, "Client B\n");
    await userEvent.click(uiA.getByRole("button", { name: "Save prompt" }));
    await uiA.findByText("Saved prompt for Alpha.");
    const signal = host.harness.inspection.realtimeSignals.at(-1)!;
    await b.behavior.emitRealtime(signal.channel, signal.payload);
    await uiB.findByText(/Saved settings changed/);
    expect(draftB.value).toBe("Client B\n");
    await userEvent.click(uiB.getByRole("switch"));
    await uiB.findByText("On · Project override");
    await userEvent.click(uiB.getByRole("button", { name: "Save prompt" }));
    await uiB.findByText(/Prompt conflict/);
    expect(b.inspection.rpcCalls.filter((c) => c.method === "setPrompt").at(-1)?.input).toEqual({
      projectId: "proj_a",
      prompt: "Client B\n",
      expectedPrompt: null,
    });
    expect(draftB.value).toBe("Client B\n");
    expect((uiB.getByRole("button", { name: "Save prompt" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await userEvent.click(uiB.getByRole("button", { name: "Reload saved settings" }));
    const cancel = await uiB.findByRole("button", { name: "Cancel" });
    expect(document.activeElement).toBe(cancel);
    await userEvent.keyboard("{Escape}");
    expect(document.activeElement).toBe(uiB.getByRole("button", { name: "Reload saved settings" }));
    expect(draftB.value).toBe("Client B\n");
    await userEvent.click(uiB.getByRole("button", { name: "Reload saved settings" }));
    await userEvent.click(uiB.getByRole("button", { name: "Discard and reload" }));
    await act(async () => {});
    expect(draftB.value).toBe("Client A\n");
    expect(document.activeElement).toBe(uiB.getByRole("button", { name: "Reload saved settings" }));
    expect(uiB.queryByText(/Prompt conflict/)).toBeNull();
    expect(b.inspection.rpcCalls.filter((c) => c.method === "setPrompt")).toHaveLength(1);
    await host.harness.behavior.runCli(["prompt", "set", "--project", "proj_a", "--text", "CLI\n"]);
    const cliSignal = host.harness.inspection.realtimeSignals.at(-1)!;
    await a.behavior.emitRealtime(cliSignal.channel, cliSignal.payload);
    await b.behavior.emitRealtime(cliSignal.channel, cliSignal.payload);
    expect(draftA.value).toBe("CLI\n");
    expect(draftB.value).toBe("CLI\n");
  });

  it("a stale confirmed Reset keeps even a clean draft and needs explicit Reload", async () => {
    const { host, handlers } = await setupHost();
    await host.harness.behavior.runCli([
      "prompt",
      "set",
      "--project",
      "proj_a",
      "--text",
      "Original",
    ]);
    const view = await mount(handlers);
    const ui = await select(view);
    await userEvent.click(ui.getByRole("button", { name: "Reset to plugin default" }));
    await host.harness.behavior.runCli(["prompt", "set", "--project", "proj_a", "--text", "Newer"]);
    await userEvent.click(ui.getByRole("button", { name: "Confirm reset" }));
    await ui.findByText(/Prompt conflict/);
    expect((ui.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Original");
    await view.behavior.emitRealtime("settings.changed", { kind: "project", projectId: "proj_a" });
    expect((ui.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Original");
    expect(
      (ui.getByRole("button", { name: "Reset to plugin default" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      await host.harness.behavior.callRpc("getProject", { projectId: "proj_a" }),
    ).toMatchObject({ prompt: "Newer" });
  });

  it("reconnect recovers missed prompt and project/default choices in clean and dirty views", async () => {
    const { host, handlers } = await setupHost();
    const view = await mount(handlers);
    const ui = await select(view);
    const editor = ui.getByRole("textbox") as HTMLTextAreaElement;
    await view.behavior.setRealtimeConnectionState("reconnecting");
    await host.harness.behavior.setSettings({ enableByDefault: true });
    await host.harness.behavior.runCli([
      "prompt",
      "set",
      "--project",
      "proj_a",
      "--text",
      "Missed",
    ]);
    await view.behavior.setRealtimeConnectionState("connected");
    await ui.findByText("On · Default");
    expect(editor.value).toBe("Missed");
    await edit(ui, "Offline draft");
    await view.behavior.setRealtimeConnectionState("reconnecting");
    await host.harness.behavior.runCli(["disable", "--project", "proj_a"]);
    await host.harness.behavior.runCli(["prompt", "reset", "--project", "proj_a"]);
    await view.behavior.setRealtimeConnectionState("connected");
    await ui.findByText("Off · Project override");
    await ui.findByText(/Saved settings changed/);
    expect(editor.value).toBe("Offline draft");
  });

  it("ignores other-project notifications and late same-project read generations", async () => {
    const late = deferred<ProjectState>();
    let reads = 0;
    const view = await mount({
      getProject: ({ projectId }) =>
        ++reads === 2 ? late.promise : state(projectId, `Read ${reads}`),
    });
    const ui = await select(view);
    await view.behavior.emitRealtime("settings.changed", { kind: "project", projectId: "proj_b" });
    await view.behavior.emitRealtime("settings.changed", { kind: "invalid" });
    expect(reads).toBe(1);
    await view.behavior.emitRealtime("settings.changed", { kind: "project", projectId: "proj_a" });
    await ui.findByText("Refreshing saved settings…");
    await view.behavior.emitRealtime("settings.changed", { kind: "default" });
    expect((ui.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Read 3");
    await act(async () => late.resolve(state("proj_a", "Late stale read")));
    expect((ui.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Read 3");
  });

  it("does not replace edits typed during a pending refresh or adopt its prompt precondition", async () => {
    const late = deferred<ProjectState>();
    let reads = 0;
    const view = await mount({
      getProject: ({ projectId }) => (++reads === 1 ? state(projectId) : late.promise),
    });
    const ui = await select(view);
    await view.behavior.emitRealtime("settings.changed", { kind: "project", projectId: "proj_a" });
    await edit(ui, "Typed during refresh");
    await act(async () => late.resolve(state("proj_a", "New saved text")));
    await ui.findByText(/Saved settings changed/);
    expect((ui.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Typed during refresh");
    await userEvent.click(ui.getByRole("button", { name: "Save prompt" }));
    expect(view.inspection.rpcCalls.find((c) => c.method === "setPrompt")?.input).toEqual({
      projectId: "proj_a",
      prompt: "Typed during refresh",
      expectedPrompt: "Loaded\n",
    });
  });

  it("invalidates a read started before a write and handles notifications during delayed Save", async () => {
    const oldRead = deferred<ProjectState>();
    const saved = deferred<PromptResult>();
    let reads = 0;
    const view = await mount({
      getProject: ({ projectId }) =>
        ++reads === 2 ? oldRead.promise : state(projectId, reads === 1 ? "Loaded\n" : "Newest"),
      setPrompt: () => saved.promise,
    });
    const ui = await select(view);
    const editor = await edit(ui, "Saved draft");
    await view.behavior.emitRealtime("settings.changed", { kind: "project", projectId: "proj_a" });
    await userEvent.click(ui.getByRole("button", { name: "Save prompt" }));
    expect(editor.disabled).toBe(true);
    await userEvent.click(ui.getByRole("button", { name: "Save prompt" }));
    await view.behavior.emitRealtime("settings.changed", { kind: "project", projectId: "proj_a" });
    await act(async () => oldRead.resolve(state("proj_a", "Old read")));
    expect(editor.value).toBe("Saved draft");
    await act(async () =>
      saved.resolve({ status: "saved", state: state("proj_a", "Saved draft") }),
    );
    await ui.findByText("Saved prompt for Alpha.");
    await act(async () => {});
    expect(editor.value).toBe("Newest");
    expect(view.inspection.rpcCalls.filter((c) => c.method === "setPrompt")).toHaveLength(1);
  });

  it("keeps a dirty draft on refresh/reload failures and makes retries explicit", async () => {
    let fail = false;
    const view = await mount({
      getProject: ({ projectId }) => {
        if (fail) throw new Error("offline");
        return state(projectId, "Saved value");
      },
    });
    const ui = await select(view);
    const editor = await edit(ui, "Keep on failure");
    fail = true;
    await view.behavior.emitRealtime("settings.changed", { kind: "project", projectId: "proj_a" });
    await ui.findByText(/Could not refresh project settings: offline/);
    expect(editor.value).toBe("Keep on failure");
    await userEvent.click(ui.getByRole("button", { name: "Reload saved settings" }));
    await userEvent.click(ui.getByRole("button", { name: "Discard and reload" }));
    await ui.findByText(/Could not refresh project settings: offline/);
    expect(editor.value).toBe("Keep on failure");
    expect(editor.disabled).toBe(false);
    fail = false;
    await userEvent.click(ui.getByRole("button", { name: "Retry project" }));
    expect(editor.value).toBe("Keep on failure");
    await userEvent.click(ui.getByRole("button", { name: "Reload saved settings" }));
    await userEvent.click(ui.getByRole("button", { name: "Discard and reload" }));
    await act(async () => {});
    expect(editor.value).toBe("Saved value");
  });

  it("ignores a late refresh after project selection and old save results after unmount", async () => {
    const late = deferred<ProjectState>();
    let reads = 0;
    const view = await mount({
      getProject: ({ projectId }) => (++reads === 2 ? late.promise : state(projectId, projectId)),
    });
    const ui = await select(view);
    await view.behavior.emitRealtime("settings.changed", { kind: "project", projectId: "proj_a" });
    await select(view, "Beta");
    await act(async () => late.resolve(state("proj_a", "Late Alpha")));
    expect((ui.getByRole("textbox") as HTMLTextAreaElement).value).toBe("proj_b");
    const save = deferred<PromptResult>();
    cleanup();
    const old = await mount({ setPrompt: () => save.promise });
    const oldUi = await select(old);
    await edit(oldUi, "Old client draft");
    await userEvent.click(oldUi.getByRole("button", { name: "Save prompt" }));
    old.unmount();
    const fresh = await mount();
    await select(fresh, "Beta");
    await act(async () =>
      save.resolve({ status: "saved", state: state("proj_a", "Old client draft") }),
    );
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Loaded\n");
    expect(screen.queryByText("Saved prompt for Alpha.")).toBeNull();
  });

  it("freezes the Reset precondition while its confirmation is open", async () => {
    const { host, handlers } = await setupHost();
    await host.harness.behavior.runCli([
      "prompt",
      "set",
      "--project",
      "proj_a",
      "--text",
      "Before dialog",
    ]);
    const view = await mount(handlers);
    const ui = await select(view);
    await userEvent.click(ui.getByRole("button", { name: "Reset to plugin default" }));
    await host.harness.behavior.runCli([
      "prompt",
      "set",
      "--project",
      "proj_a",
      "--text",
      "After dialog",
    ]);
    await view.behavior.emitRealtime("settings.changed", { kind: "project", projectId: "proj_a" });
    await userEvent.click(ui.getByRole("button", { name: "Confirm reset" }));
    await ui.findByText(/Prompt conflict/);
    expect(view.inspection.rpcCalls.find((c) => c.method === "setPrompt")?.input).toEqual({
      projectId: "proj_a",
      prompt: null,
      expectedPrompt: "Before dialog",
    });
    expect(
      await host.harness.behavior.callRpc("getProject", { projectId: "proj_a" }),
    ).toMatchObject({ prompt: "After dialog" });
  });

  it("a failed Save retries with the same loaded precondition, not a newer refresh value", async () => {
    const late = deferred<PromptResult>();
    let reads = 0;
    let writes = 0;
    const view = await mount({
      getProject: ({ projectId }) =>
        state(projectId, ++reads === 1 ? "Loaded\n" : "Changed externally"),
      setPrompt: () => {
        if (++writes === 1) return late.promise;
        return { status: "conflict", state: state("proj_a", "Changed externally") };
      },
    });
    const ui = await select(view);
    const editor = await edit(ui, "Retry draft");
    await userEvent.click(ui.getByRole("button", { name: "Save prompt" }));
    await view.behavior.emitRealtime("settings.changed", { kind: "project", projectId: "proj_a" });
    await act(async () => late.reject(new Error("lost response")));
    await ui.findByText(/Could not save: lost response/);
    await ui.findByText(/Saved settings changed/);
    expect(editor.value).toBe("Retry draft");
    await userEvent.click(ui.getByRole("button", { name: "Save prompt" }));
    await ui.findByText(/Prompt conflict/);
    expect(
      view.inspection.rpcCalls.filter((c) => c.method === "setPrompt").map((c) => c.input),
    ).toEqual(
      Array(2).fill({ projectId: "proj_a", prompt: "Retry draft", expectedPrompt: "Loaded\n" }),
    );
  });

  it("rejects mismatched read and save targets without replacing the editor", async () => {
    let mismatch = true;
    const view = await mount({
      getProject: ({ projectId }) => state(mismatch ? "proj_b" : projectId),
      setPrompt: () => ({ status: "saved", state: state("proj_b", "Wrong project") }),
    });
    await userEvent.selectOptions(
      await screen.findByRole("combobox"),
      await screen.findByRole("option", { name: "Alpha" }),
    );
    await screen.findByText(/Project response did not match the selection/);
    expect(screen.queryByRole("textbox")).toBeNull();
    mismatch = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry project" }));
    const ui = within(view.container);
    await ui.findByRole("textbox");
    const editor = await edit(ui, "Correct project draft");
    await userEvent.click(ui.getByRole("button", { name: "Save prompt" }));
    await ui.findByText(/Project response did not match the save target/);
    expect(editor.value).toBe("Correct project draft");
    expect(ui.queryByText("Saved prompt for Alpha.")).toBeNull();
  });

  it("explicit Reload recovers a missed change in a clean editor without a discard dialog", async () => {
    const { host, handlers } = await setupHost();
    const view = await mount(handlers);
    const ui = await select(view);
    await host.harness.behavior.runCli(["enable", "--project", "proj_a"]);
    await host.harness.behavior.runCli([
      "prompt",
      "set",
      "--project",
      "proj_a",
      "--text",
      "Missed notification",
    ]);
    await userEvent.click(ui.getByRole("button", { name: "Reload saved settings" }));
    await ui.findByText("On · Project override");
    expect((ui.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Missed notification");
    expect(ui.queryByRole("dialog")).toBeNull();
    expect(view.inspection.rpcCalls.filter((c) => c.method.startsWith("set"))).toEqual([]);
  });

  it.each(["failed", "saved"] as const)(
    "successful Reload clears old %s write feedback, but failed Reload keeps it",
    async (outcome) => {
      let failRead = false;
      const view = await mount({
        getProject: ({ projectId }) => {
          if (failRead) throw new Error("Reload offline");
          return state(projectId, "Current saved text");
        },
        setPrompt: ({ projectId, prompt }) => {
          if (outcome === "failed") throw new Error("Save offline");
          return { status: "saved", state: state(projectId, prompt!) };
        },
      });
      const ui = await select(view);
      const editor = await edit(ui, "Written draft");
      await userEvent.click(ui.getByRole("button", { name: "Save prompt" }));
      const feedback =
        outcome === "failed" ? /Could not save: Save offline/ : /Saved prompt for Alpha/;
      await ui.findByText(feedback);
      async function reload() {
        await userEvent.click(ui.getByRole("button", { name: "Reload saved settings" }));
        if (outcome === "failed")
          await userEvent.click(ui.getByRole("button", { name: "Discard and reload" }));
      }
      failRead = true;
      await reload();
      await ui.findByText(/Could not refresh project settings: Reload offline/);
      expect(editor.value).toBe("Written draft");
      expect(ui.getByText(feedback)).toBeTruthy();
      failRead = false;
      await reload();
      await act(async () => {});
      expect(editor.value).toBe("Current saved text");
      expect(ui.queryByText(feedback)).toBeNull();
    },
  );
});
