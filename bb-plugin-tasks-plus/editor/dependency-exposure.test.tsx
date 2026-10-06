// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorExtensions } from "./extensions";
import { TasksEditor } from "./tasks-editor";

afterEach(cleanup);

function expectNoInjectedAttributes(surface: Element): void {
  expect(
    surface.querySelector("[onerror], [onclick], [data-inherited-canary], [__proto__]"),
  ).toBeNull();
}

describe("Tiptap advisory input boundaries", () => {
  const html =
    '<img src="https://example.com/image.png" alt="kept" onerror="alert(1)" __proto__="injected" data-inherited-canary="injected">';

  it("discards unknown attributes when Tasks loads and replaces Markdown with raw HTML", async () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <TasksEditor value={html} onChange={onChange} readOnly />,
    );
    const surface = container.querySelector(".tiptap")!;
    expect(surface.querySelector("img")?.getAttribute("alt")).toBe("kept");
    expectNoInjectedAttributes(surface);

    rerender(<TasksEditor value={html.replace("kept", "replaced")} onChange={onChange} readOnly />);
    await waitFor(() => {
      expect(surface.querySelector("img")?.getAttribute("alt")).toBe("replaced");
    });
    expectNoInjectedAttributes(surface);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not pass unknown JSON attributes through the fixed editor schema", () => {
    // Tasks accepts strings, not this JSON. Keep the schema boundary checked too.
    const content = JSON.parse(
      '{"type":"doc","content":[{"type":"image","attrs":{"src":"https://example.com/image.png","alt":"kept","__proto__":{"data-inherited-canary":"injected","onerror":"alert(1)"},"onerror":"alert(1)"}}]}',
    );
    const editor = new Editor({ extensions: createEditorExtensions(), content });
    try {
      expect(editor.view.dom.querySelector("img")?.getAttribute("alt")).toBe("kept");
      expectNoInjectedAttributes(editor.view.dom);
      expect(editor.getHTML()).not.toContain("injected");
    } finally {
      editor.destroy();
    }
  });
});
