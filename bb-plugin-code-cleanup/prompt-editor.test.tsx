// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginRpcTestHandlers } from "@get-bb/plugin-sdk/testing/app";
import type { ProjectState, SettingsContract } from "./rpc";

afterEach(cleanup);
const choices = [{ id: "proj_a", name: "Alpha" }, { id: "proj_b", name: "Beta" }];
const source = "  # Saved\n\n`$(name)` and ${HOME}\n";
const state = (projectId: string, prompt: string | null = source): ProjectState => ({ projectId, enabled: false, prompt, effectivePrompt: prompt ?? "# Factory\nRecord cleanup through BB Tasks.\n" });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
async function mount(overrides: Partial<PluginRpcTestHandlers<SettingsContract>> = {}) {
  const app = await loadPluginApp(() => import("./app"));
  return renderSlot<{}, SettingsContract>(app.settingsSections[0], {}, { rpc: {
    listProjects: () => choices, getProject: ({ projectId }) => state(projectId),
    setEnablement: ({ projectId, enabled }) => ({ ...state(projectId), enabled }),
    setPrompt: ({ projectId, prompt }) => state(projectId, prompt), ...overrides,
  } });
}
async function select(name = "Alpha") {
  await userEvent.selectOptions(await screen.findByRole("combobox", { name: "Project" }), await screen.findByRole("option", { name }));
}
async function edit(text: string) {
  const editor = await screen.findByRole("textbox", { name: "Cleanup guidance" });
  await userEvent.clear(editor); await userEvent.click(editor); await userEvent.paste(text); return editor as HTMLTextAreaElement;
}

describe("Markdown prompt editor", () => {
  it("provides an icon toolbar with named tooltips, keyboard tabs, and disclosed help", async () => {
    await mount(); await select();
    const editTab = await screen.findByRole("tab", { name: "Edit" });
    const previewTab = screen.getByRole("tab", { name: "Preview" });
    expect(editTab.querySelector('[data-icon="Edit"]')).toBeTruthy();
    expect(previewTab.querySelector('[data-icon="Eye"]')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save prompt" }).querySelector('[data-icon="Save"]')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset to plugin default" }).querySelector('[data-icon="RotateCcw"]')).toBeTruthy();
    expect(screen.queryByText(/Code Cleanup is Off for this project/)).toBeNull();
    expect(screen.queryByText(/editor matches the saved guidance/)).toBeNull();
    const help = screen.getByRole("button", { name: "Task recording requirements" });
    expect(help.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("region", { name: "Task recording requirements" })).toBeNull();
    await userEvent.click(help);
    expect(screen.getByRole("region", { name: "Task recording requirements" }).textContent).toContain("one linked tracker");
    await userEvent.click(help);
    editTab.focus();
    await screen.findByRole("tooltip", { name: "Edit" });
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip", { name: "Edit" })).toBeNull();
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(previewTab);
    expect(previewTab.getAttribute("aria-selected")).toBe("true");
    expect(editTab.getAttribute("tabindex")).toBe("-1");
    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toBe(editTab);
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(previewTab);
    await userEvent.hover(screen.getByRole("button", { name: "Reset to plugin default" }));
    expect(screen.getByRole("tooltip", { name: "Reset to plugin default" })).toBeTruthy();
  });

  it("Escape cancels reset and restores focus to its icon without losing the draft", async () => {
    await mount(); await select(); await edit("Keep this draft");
    const reset = screen.getByRole("button", { name: "Reset to plugin default" });
    await userEvent.click(reset);
    const cancel = await screen.findByRole("button", { name: "Cancel" });
    expect(document.activeElement).toBe(cancel);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(reset);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Keep this draft");
  });

  it("round-trips exact source through Edit and host Preview, then saves while disabled", async () => {
    const view = await mount(); await select();
    expect((await screen.findByRole("textbox", { name: "Cleanup guidance" }) as HTMLTextAreaElement).value).toBe(source);
    expect(screen.getByText("Prompt source: Custom")).toBeTruthy();
    const draft = '  # Draft\n\n- `$(echo "$HOME")`\n<script>alert(1)</script>\n![image](https://example.com/image)\n';
    await edit(draft);
    await userEvent.click(screen.getByRole("tab", { name: "Preview" }));
    // The official harness represents the host component, not the production parser.
    const preview = screen.getByRole("region", { name: "Guidance preview" });
    expect(preview.textContent).toContain(draft);
    expect(preview.querySelector("script")).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "Edit" }));
    expect((screen.getByRole("textbox", { name: "Cleanup guidance" }) as HTMLTextAreaElement).value).toBe(draft);
    expect(screen.getByText(`${draft.length} / 4096 characters`)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Save prompt" }));
    await screen.findByText("Saved prompt for Alpha.");
    expect(view.inspection.rpcCalls.at(-1)).toEqual({ method: "setPrompt", input: { projectId: "proj_a", prompt: draft } });
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
  });

  it("rejects blank and oversized drafts without RPC and retains the text", async () => {
    const view = await mount(); await select();
    for (const text of ["", " \n\t", "x".repeat(4097)]) {
      await edit(text); await userEvent.click(screen.getByRole("button", { name: "Save prompt" }));
      expect((await screen.findByRole("alert")).textContent).toMatch(/nonblank|4096/);
      expect((screen.getByRole("textbox", { name: "Cleanup guidance" }) as HTMLTextAreaElement).value).toBe(text);
    }
    expect(view.inspection.rpcCalls.some(c => c.method === "setPrompt")).toBe(false);
  });

  it("blocks selection and edits during persistence, reports success only after confirmation, and keeps failed drafts", async () => {
    const pending = deferred<ProjectState>(); let calls = 0;
    await mount({ setPrompt: () => { if (++calls === 1) return pending.promise; throw new Error("offline"); } });
    await select(); const editor = await edit("Draft\n");
    await userEvent.click(screen.getByRole("button", { name: "Save prompt" }));
    expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(true);
    expect(editor.disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Reset to plugin default" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText("Saved prompt for Alpha.")).toBeNull();
    await act(async () => pending.resolve(state("proj_a", "Draft\n")));
    await screen.findByText("Saved prompt for Alpha.");
    await edit("Failed draft\n"); await userEvent.click(screen.getByRole("button", { name: "Save prompt" }));
    expect((await screen.findByRole("alert")).textContent).toContain("offline");
    expect(editor.value).toBe("Failed draft\n");
    expect(screen.queryByText("Saved prompt for Alpha.")).toBeNull();
  });

  it("confirms project discard and reset, cancel keeps the draft, and failed reset keeps it too", async () => {
    let fail = true; const view = await mount({ setPrompt: ({ projectId, prompt }) => { if (fail) throw new Error("reset failed"); return state(projectId, prompt); } });
    await select(); await edit("Unsaved\n"); await select("Beta");
    await screen.findByRole("dialog", { name: "Discard unsaved prompt?" });
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("proj_a");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Unsaved\n");
    await userEvent.click(screen.getByRole("button", { name: "Reset to plugin default" }));
    await screen.findByRole("dialog", { name: "Reset prompt to plugin default?" });
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(view.inspection.rpcCalls.some(c => c.method === "setPrompt")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Reset to plugin default" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm reset" }));
    expect((await screen.findByRole("alert")).textContent).toContain("reset failed");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Unsaved\n");
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Reset to plugin default" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm reset" }));
    await screen.findByText("Reset prompt for Alpha to plugin default.");
    expect(screen.getByText("Prompt source: Plugin default")).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toContain("# Factory");
    expect(view.inspection.rpcCalls.at(-1)).toEqual({ method: "setPrompt", input: { projectId: "proj_a", prompt: null } });
    await edit("Another draft"); await select("Beta");
    await userEvent.click(screen.getByRole("button", { name: "Discard and switch" }));
    expect((await screen.findByRole("textbox") as HTMLTextAreaElement).value).toBe(source);
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("proj_b");
  });

  it("an enablement response does not replace a dirty prompt", async () => {
    await mount(); await select(); await edit("Keep this draft\n");
    await userEvent.click(screen.getByRole("switch"));
    await screen.findByText("Saved. Code Cleanup is On for Alpha.");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Keep this draft\n");
  });
});
