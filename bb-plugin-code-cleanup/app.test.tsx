// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./server";
import type { ProjectState, SettingsContract } from "./rpc";
import type { PluginRpcTestHandlers } from "@get-bb/plugin-sdk/testing/app";
const hosts: Array<ReturnType<typeof createFakePluginHost>["harness"]> = [];
afterEach(async () => {
  cleanup();
  while (hosts.length) await hosts.pop()!.lifecycle.dispose();
});
const choices = [
  { id: "proj_a", name: "Alpha" },
  { id: "proj_b", name: "Beta" },
];
const state = (projectId: string): ProjectState => ({
  projectId,
  enabled: false,
  enabledOverride: false,
  enableByDefault: false,
  prompt: "  Exact\n\npolicy ",
  effectivePrompt: "  Exact\n\npolicy ",
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function mount(
  overrides: Partial<PluginRpcTestHandlers<SettingsContract>> = {},
  initialConnection: "connected" | "connecting" = "connected",
) {
  const app = await loadPluginApp(() => import("./app"));
  expect(app.settingsSections).toHaveLength(1);
  return renderSlot<{}, SettingsContract>(
    app.settingsSections[0],
    {},
    {
      realtimeConnectionState: initialConnection,
      rpc: {
        listProjects: () => choices,
        getProject: ({ projectId }) => state(projectId),
        setPrompt: ({ projectId, prompt }) => ({
          ...state(projectId),
          prompt,
          effectivePrompt: prompt ?? "Factory guidance",
        }),
        setEnablement: ({ projectId, enabledOverride }) => ({
          ...state(projectId),
          enabledOverride,
          enabled: enabledOverride ?? false,
        }),
        ...overrides,
      },
    },
  );
}
async function select(name = "Alpha") {
  const option = await screen.findByRole("option", { name });
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Project" }), option);
}

describe("project Settings", () => {
  it("recovers a missed default change on first connection without replacing a draft", async () => {
    let enableByDefault = false;
    const rendered = await mount(
      {
        getProject: ({ projectId }) => ({
          ...state(projectId),
          enabled: enableByDefault,
          enabledOverride: null,
          enableByDefault,
        }),
      },
      "connecting",
    );
    await select();
    const editor = await screen.findByRole("textbox", { name: "Cleanup guidance" });
    await screen.findByText("Off · Default");
    await userEvent.clear(editor);
    await userEvent.type(editor, "Keep first-connection draft");
    enableByDefault = true;
    await rendered.behavior.setRealtimeConnectionState("connected");
    await screen.findByText("On · Default");
    expect(
      screen.getByRole("switch", { name: "Enable for this project" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect((editor as HTMLTextAreaElement).value).toBe("Keep first-connection draft");
    expect(rendered.inspection.rpcCalls.filter((call) => call.method.startsWith("set"))).toEqual(
      [],
    );
  });

  it("returns only enablement to the default and keeps the prompt and draft", async () => {
    const rendered = await mount();
    await select();
    const editor = await screen.findByRole("textbox", { name: "Cleanup guidance" });
    await userEvent.clear(editor);
    await userEvent.type(editor, "Unsaved draft");
    await userEvent.click(screen.getByRole("button", { name: "Use default" }));
    await screen.findByText("Off · Default");
    expect(rendered.inspection.rpcCalls.at(-1)).toEqual({
      method: "setEnablement",
      input: { projectId: "proj_a", enabledOverride: null },
    });
    expect((editor as HTMLTextAreaElement).value).toBe("Unsaved draft");
    expect(
      (screen.getByRole("button", { name: "Use default" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("switch", { name: "Enable for this project" }));
    await screen.findByText("On · Project override");
    expect(rendered.inspection.rpcCalls.at(-1)).toEqual({
      method: "setEnablement",
      input: { projectId: "proj_a", enabledOverride: true },
    });
  });

  it("refreshes enablement after default changes without losing a prompt draft", async () => {
    let enableByDefault = false;
    const rendered = await mount({
      getProject: ({ projectId }) => ({
        ...state(projectId),
        enabled: enableByDefault,
        enabledOverride: null,
        enableByDefault,
      }),
    });
    await select();
    const editor = await screen.findByRole("textbox", { name: "Cleanup guidance" });
    await userEvent.clear(editor);
    await userEvent.type(editor, "Keep this draft");
    enableByDefault = true;
    await rendered.behavior.emitRealtime("settings.changed", { kind: "default" });
    await screen.findByText("On · Default");
    expect((editor as HTMLTextAreaElement).value).toBe("Keep this draft");
    expect(
      screen.getByRole("switch", { name: "Enable for this project" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(rendered.inspection.rpcCalls.filter((call) => call.method.startsWith("set"))).toEqual(
      [],
    );
  });

  it("reconciles a default change that arrived during the initial project read", async () => {
    const initial = deferred<ProjectState>();
    let reads = 0;
    const rendered = await mount({
      getProject: ({ projectId }) => {
        if (++reads === 1) return initial.promise;
        return { ...state(projectId), enabled: true, enabledOverride: null, enableByDefault: true };
      },
    });
    await select();
    await screen.findByText("Loading project settings…");
    await rendered.behavior.emitRealtime("settings.changed", { kind: "default" });
    await act(async () => initial.resolve({ ...state("proj_a"), enabledOverride: null }));
    await screen.findByText("On · Default");
    expect(
      (screen.getByRole("textbox", { name: "Cleanup guidance" }) as HTMLTextAreaElement).value,
    ).toBe(state("proj_a").effectivePrompt);
  });

  it("recovers a missed default change on reconnect without replacing a draft", async () => {
    let enableByDefault = false;
    const rendered = await mount({
      getProject: ({ projectId }) => ({
        ...state(projectId),
        enabled: enableByDefault,
        enabledOverride: null,
        enableByDefault,
      }),
    });
    await select();
    const editor = await screen.findByRole("textbox", { name: "Cleanup guidance" });
    await userEvent.clear(editor);
    await userEvent.type(editor, "Keep offline draft");
    await rendered.behavior.setRealtimeConnectionState("reconnecting");
    enableByDefault = true;
    await rendered.behavior.setRealtimeConnectionState("connected");
    await screen.findByText("On · Default");
    expect((editor as HTMLTextAreaElement).value).toBe("Keep offline draft");
  });

  it("requires explicit selection, reads exact guidance, then persists through official host RPC", async () => {
    const host = createFakePluginHost({
      pluginId: "code-cleanup",
      sdk: {
        projects: {
          list: async () =>
            [
              ...choices.map((p) => ({ ...p, kind: "standard" })),
              { id: "personal", name: "Personal", kind: "personal" },
            ] as never,
        },
      },
    });
    hosts.push(host.harness);
    await plugin(host.bb);
    await host.harness.behavior.runCli([
      "prompt",
      "set",
      "--project",
      "proj_a",
      "--text",
      state("proj_a").prompt!,
    ]);
    const call = host.harness.behavior.callRpc;
    const rendered = await mount({
      listProjects: async () => (await call("listProjects", {})) as typeof choices,
      getProject: async (input) => (await call("getProject", input)) as ProjectState,
      setEnablement: async (input) => (await call("setEnablement", input)) as ProjectState,
      setPrompt: async (input) => (await call("setPrompt", input)) as ProjectState,
    });
    expect(await screen.findByText("Select a project to inspect its guidance.")).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("option", { name: "Personal" })).toBeNull();
    expect(rendered.inspection.rpcCalls.map((c) => c.method)).toEqual(["listProjects"]);
    await select();
    const editor = await screen.findByRole("textbox", { name: "Cleanup guidance" });
    expect((editor as HTMLTextAreaElement).value).toBe(state("proj_a").prompt);
    expect(screen.getByText("Prompt source: Custom")).toBeTruthy();
    const toggle = screen.getByRole("switch", { name: "Enable for this project" });
    toggle.focus();
    await userEvent.keyboard(" ");
    await screen.findByText("Saved. Code Cleanup is On for Alpha.");
    expect(rendered.inspection.rpcCalls.at(-1)).toEqual({
      method: "setEnablement",
      input: { projectId: "proj_a", enabledOverride: true },
    });
    expect((await host.harness.behavior.runCli(["show", "--project", "proj_a"])).stdout).toContain(
      "enabled; prompt: custom",
    );
    const exact = '  # Custom\n\n`$(echo "$HOME")` and ${literal}\n';
    await userEvent.clear(editor);
    await userEvent.click(editor);
    await userEvent.paste(exact);
    await userEvent.click(screen.getByRole("button", { name: "Save prompt" }));
    await screen.findByText("Saved prompt for Alpha.");
    const db = host.bb.storage.database();
    expect(
      db.prepare("SELECT enabled, prompt FROM project_settings WHERE project_id = ?").get("proj_a"),
    ).toEqual({ enabled: 1, prompt: exact });
    expect((editor as HTMLTextAreaElement).value).toBe(exact);
    await userEvent.click(screen.getByRole("button", { name: "Reset to plugin default" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm reset" }));
    await screen.findByText("Reset prompt for Alpha to plugin default.");
    expect(
      db.prepare("SELECT enabled, prompt FROM project_settings WHERE project_id = ?").get("proj_a"),
    ).toEqual({ enabled: 1, prompt: null });
    expect((await host.harness.behavior.runCli(["show", "--project", "proj_a"])).stdout).toContain(
      "enabled; prompt: default",
    );
  });

  it("shows empty and list failure states with retry", async () => {
    await mount({ listProjects: () => [] });
    await screen.findByText("No standard projects are available.");
    expect(screen.queryByRole("switch")).toBeNull();
    cleanup();
    let fails = true;
    await mount({
      listProjects: () => {
        if (fails) throw new Error("offline");
        return choices;
      },
    });
    expect((await screen.findByRole("alert")).textContent).toContain("offline");
    fails = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry projects" }));
    await screen.findByRole("option", { name: "Alpha" });
  });

  it("blocks writes while loading, shows retryable read failure, and ignores late reads", async () => {
    const late = deferred<ProjectState>();
    let aReads = 0;
    await mount({
      getProject: ({ projectId }) => {
        if (projectId === "proj_a") {
          aReads++;
          if (aReads === 1) throw new Error("read failed");
          return late.promise;
        }
        return { ...state(projectId), effectivePrompt: "Beta guidance", prompt: null };
      },
    });
    await select();
    await screen.findByRole("alert");
    expect(screen.queryByRole("switch")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Retry project" }));
    await screen.findByText("Loading project settings…");
    expect(screen.queryByRole("switch")).toBeNull();
    await select("Beta");
    await screen.findByRole("textbox", { name: "Cleanup guidance" });
    await act(async () => {
      late.resolve(state("proj_a"));
      await late.promise;
    });
    expect(
      (screen.getByRole("textbox", { name: "Cleanup guidance" }) as HTMLTextAreaElement).value,
    ).toBe("Beta guidance");
    expect(screen.getByText("Prompt source: Plugin default")).toBeTruthy();
  });

  it("freezes the write target, disables overlapping writes, and retains saved state after failure", async () => {
    const pending = deferred<ProjectState>();
    let calls = 0;
    await mount({
      setEnablement: () => {
        calls++;
        if (calls === 1) return pending.promise;
        throw new Error("write failed");
      },
    });
    await select();
    const toggle = await screen.findByRole("switch", { name: "Enable for this project" });
    await userEvent.click(toggle);
    expect((screen.getByRole("combobox", { name: "Project" }) as HTMLSelectElement).disabled).toBe(
      true,
    );
    expect((toggle as HTMLButtonElement).disabled).toBe(true);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await screen.findByText("Saving for Alpha…");
    await act(async () => pending.resolve({ ...state("proj_a"), enabled: true }));
    await screen.findByText("Saved. Code Cleanup is On for Alpha.");
    await userEvent.click(toggle);
    expect((await screen.findByRole("alert")).textContent).toContain("write failed");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByText(/Saved\./)).toBeNull();
    expect((screen.getByRole("combobox", { name: "Project" }) as HTMLSelectElement).disabled).toBe(
      false,
    );
  });
});
