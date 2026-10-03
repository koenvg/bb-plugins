import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import plugin from "../app";
import type { ReadResult } from "../source";

const source = { kind: "workspace" as const, threadId: null, environmentId: "env", projectId: "project", experimental_hostId: "remote" };
const target = { path: "note.md", source };
const props = { ...target, Original: () => <p>Bound original for note.md</p> };
function ready(text: string, path = target.path): ReadResult {
  return { kind: "ready", snapshot: { text, target: { ...target, path }, sha256: "hash", sizeBytes: text.length, hostId: "remote", rootPath: "/work", documentPath: `/work/${path}`, documentDirectory: "/work" } };
}
async function mount(read: () => ReadResult | Promise<ReadResult> = () => ready("# Document")) {
  const app = await loadPluginApp(plugin);
  const slot = renderSlot(app.fileOpeners[0]!, props, { rpc: { read_document: read } });
  return { app, slot };
}
afterEach(cleanup);

describe("rendered reader", () => {
  it("registers only a live md/markdown file opener", async () => {
    const { app, slot } = await mount();
    expect(app.fileOpeners).toHaveLength(1);
    expect(app.fileOpeners[0]!.extensions).toEqual(["md", "markdown"]);
    expect(app.sourceCodeRenderers).toHaveLength(0);
    expect(app.diffRenderers).toHaveLength(0);
    expect(app.contentScripts).toHaveLength(0);
    expect(app.messageDirectives).toHaveLength(0);
    await slot.findByRole("heading", { name: "Document" });
    expect(slot.inspection.rpcCalls).toEqual([{ method: "read_document", input: target }]);
  });
  it("shows loading, then exact immutable read-only Raw without a view-switch read", async () => {
    let resolve!: (result: ReadResult) => void;
    const pending = new Promise<ReadResult>(r => { resolve = r; });
    const { slot } = await mount(() => pending);
    expect(slot.getByRole("status").textContent).toMatch(/Loading/);
    const text = "---\r\ntitle: actual\r\n---\r\n# Exact\r\n\r\n```json\r\n{\"compact\":true}  \r\n```\r\n";
    resolve(ready(text));
    await slot.findByRole("heading", { name: "Exact" });
    fireEvent.click(slot.getByRole("button", { name: "Raw" }));
    const raw = slot.getByLabelText("Raw Markdown");
    expect(raw.textContent).toBe(text);
    expect(raw.hasAttribute("contenteditable")).toBe(false);
    expect(slot.queryByRole("textbox")).toBeNull();
    fireEvent.click(slot.getByRole("button", { name: "Preview" }));
    await slot.findByRole("heading", { name: "Exact" });
    expect(slot.inspection.rpcCalls).toHaveLength(1);
  });
  it("preserves GFM semantics and fenced whitespace without inferred metadata or active destinations", async () => {
    const text = '# Plain **document**\n\n## Section\n\n`fulfilled` and ~~removed~~.\n\n> A quote\n\n1. First\n2. Second\n\n- [x] Done\n- [ ] Pending\n\n| Key | Value |\n| --- | --- |\n| real | inconclusive |\n\n```unknown\n  <script>bad()</script>\n{\"compact\":true}  \n```\n\n[sibling](next.md) [external](https://example.com) [unsafe](javascript:alert(1))\n\n![Local alt](image.png) ![Remote alt](https://example.com/image.png)\n\n<script>window.bad = true</script>\n<iframe src="https://example.com"></iframe>\n<img src="x" onerror="bad()">\n';
    const { slot } = await mount(() => ready(text));
    await slot.findByRole("heading", { name: "Plain document", level: 1 });
    expect(slot.getByRole("heading", { name: "Section", level: 2 })).toBeTruthy();
    expect(slot.getByRole("table").textContent).toContain("inconclusive");
    expect(slot.container.querySelector("del")?.textContent).toBe("removed");
    expect(slot.container.querySelector("blockquote")?.textContent).toContain("A quote");
    expect(slot.container.querySelector("ol")?.children).toHaveLength(2);
    const checks = slot.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checks.every(c => c.disabled)).toBe(true);
    expect(checks.map(c => c.checked)).toEqual([true, false]);
    expect(slot.container.querySelector("pre code")?.textContent).toBe('  <script>bad()</script>\n{\"compact\":true}  \n');
    expect(slot.container.querySelectorAll("a[href], img, script, iframe, .status, .document-meta")).toHaveLength(0);
    expect(slot.getByText("Local alt")).toBeTruthy();
    expect(slot.getByText("Remote alt")).toBeTruthy();
    expect(slot.inspection.navigateCalls).toHaveLength(0);
  });
  it("reports an empty file and preserves empty Raw", async () => {
    const { slot } = await mount(() => ready(""));
    await slot.findByText("This file is empty.");
    fireEvent.click(slot.getByRole("button", { name: "Raw" }));
    expect(slot.getByLabelText("Raw Markdown").textContent).toBe("");
  });
  it.each(["error", "unsupported"] as const)("offers Retry and bound Original for %s without recursive navigation", async kind => {
    const { slot } = await mount(() => ({ kind, message: "Cannot read this document." }));
    await slot.findByText("Cannot read this document.");
    expect(slot.getByRole("button", { name: "Retry" })).toBeTruthy();
    fireEvent.click(slot.getByRole("button", { name: "Open in BB preview" }));
    await slot.findByText("Bound original for note.md");
    expect(slot.inspection.rpcCalls).toHaveLength(1);
    expect(slot.inspection.navigateCalls).toHaveLength(0);
  });
  it("refreshes only on request and removes old content on a failed refresh", async () => {
    let reads = 0;
    const { slot } = await mount(() => ++reads === 1 ? ready("# First") : reads === 2 ? ready("# Updated") : Promise.reject(new Error("Disconnected")));
    await slot.findByRole("heading", { name: "First" });
    fireEvent.click(slot.getByRole("button", { name: "Refresh" }));
    await slot.findByRole("heading", { name: "Updated" });
    fireEvent.click(slot.getByRole("button", { name: "Refresh" }));
    await slot.findByText("Disconnected");
    expect(slot.queryByRole("heading", { name: "Updated" })).toBeNull();
    fireEvent.click(slot.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(reads).toBe(4));
  });
  it("discards late reads when the target changes or unmounts", async () => {
    let finish!: (r: ReadResult) => void;
    let reads = 0;
    const pending = new Promise<ReadResult>(r => { finish = r; });
    const { app, slot } = await mount(() => ++reads === 1 ? pending : ready("# Second", "second.md"));
    const Reader = app.fileOpeners[0]!.component;
    slot.lifecycle.rerender(<Reader {...props} path="second.md" />);
    await slot.findByRole("heading", { name: "Second" });
    finish(ready("# Late first"));
    await waitFor(() => expect(slot.queryByRole("heading", { name: "Late first" })).toBeNull());
    slot.lifecycle.unmount();
  });
  it("does not reload for a newly allocated but identical source", async () => {
    const { app, slot } = await mount();
    await slot.findByRole("heading", { name: "Document" });
    const Reader = app.fileOpeners[0]!.component;
    slot.lifecycle.rerender(<Reader {...props} source={{ ...source }} />);
    await waitFor(() => expect(slot.inspection.rpcCalls).toHaveLength(1));
  });
  it("provides keyboard-operable baseline controls with no theme or outline switch", async () => {
    const { slot } = await mount();
    await slot.findByRole("heading", { name: "Document" });
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).toBe(slot.getByRole("button", { name: "Preview" }));
    await user.tab();
    await user.keyboard("{Enter}");
    expect(slot.getByLabelText("Raw Markdown")).toBeTruthy();
    expect(slot.queryByRole("button", { name: /theme|appearance|outline/i })).toBeNull();
  });
  it("ignores a read that finishes after the reader unmounts", async () => {
    let finish!: (result: ReadResult) => void;
    const { slot } = await mount(() => new Promise(resolve => { finish = resolve; }));
    slot.lifecycle.unmount();
    finish(ready("# After unmount"));
    await Promise.resolve();
    expect(document.body.textContent).not.toContain("After unmount");
  });
  it("keeps a fence above the later highlighting budget as exact plain code", async () => {
    const code = "  x".repeat(8000) + "\n";
    const { slot } = await mount(() => ready("```json\n" + code + "```\n"));
    const block = await slot.findByLabelText("Code block");
    expect(block.textContent).toBe(code);
    expect(block.querySelector("span")).toBeNull();
  });
});
