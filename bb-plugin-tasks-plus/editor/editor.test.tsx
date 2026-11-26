// @vitest-environment jsdom
import { fail as missingValue } from "node:assert/strict";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { createEditorExtensions } from "./extensions.js";
import { TasksEditor } from "./tasks-editor.js";

const layoutlessElement = document.createElement("span");
Range.prototype.getClientRects ??= () => layoutlessElement.getClientRects();
Range.prototype.getBoundingClientRect ??= () => layoutlessElement.getBoundingClientRect();

afterEach(cleanup);

function getEditorSurface(container: HTMLElement): HTMLElement {
  const surface = container.querySelector(".tiptap");
  if (!(surface instanceof HTMLElement)) {
    throw new Error("Expected TipTap surface");
  }
  return surface;
}

function roundTrip(markdown: string): string {
  const editor = new Editor({
    extensions: createEditorExtensions(),
    content: markdown,
  });
  try {
    return editor.storage.markdown.getMarkdown() as string;
  } finally {
    editor.destroy();
  }
}

describe("markdown round-trip", () => {
  const cases: [string, string][] = [
    ["paragraphs", "First paragraph.\n\nSecond paragraph."],
    ["headings", "# Title\n\n## Section\n\n### Subsection"],
    ["marks", "Some **bold**, *italic*, ~~struck~~, and `inline code` text."],
    ["bullet list", "- one\n- two\n- three"],
    ["ordered list", "1. first\n2. second"],
    ["nested bullets", "- parent\n  - child"],
    ["task list", "- [ ] open task\n- [x] done task"],
    ["code block", "```ts\nconst answer = 42;\n```"],
    ["blockquote", "> quoted wisdom"],
    ["link", "Read the [bb guide](https://example.com/guide)."],
    ["image", "![diagram](https://example.com/diagram.png)"],
    ["mention", "Blocked on [TSK-42](bbtask://TSK-42) for review."],
    ["thread mention", "Discussed in [Fix login flow](bbthread://thr_a82u8wp8qq) yesterday."],
    [
      "mixed document",
      "## Plan\n\nShip the **editor** with `tiptap`.\n\n- [x] parse\n- [ ] serialize\n\n> Notes on [TSK-7](bbtask://TSK-7)\n\n```\nplain code\n```",
    ],
  ];
  it.each(cases)("preserves %s", (_name, markdown) => {
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it("preserves table rows and cells", () => {
    const markdown = "| Item | Owner |\n| --- | --- |\n| Parser | Ada |\n| Styles | Lin |";

    expect(roundTrip(markdown).trimEnd()).toBe(markdown);
  });

  it.each([
    ["plain text", "left \\| right"],
    ["inline code", "`left\\|right`"],
  ])("preserves a pipe inside table-cell %s", (_name, cell) => {
    const markdown = `| Value |\n| --- |\n| ${cell} |`;

    expect(roundTrip(markdown).trimEnd()).toBe(markdown);
  });

  it("preserves a pipe inside a table-cell link destination", () => {
    const markdown = "| Value |\n| --- |\n| [destination](https://example.com/a\\|b) |";

    expect(roundTrip(markdown).trimEnd()).toBe(
      "| Value |\n| --- |\n| [destination](https://example.com/a%7Cb) |",
    );
  });

  it("preserves atom-only cells when another block is edited", async () => {
    const value = [
      "| Image | Task | Thread |",
      "| --- | --- | --- |",
      "| ![diagram](https://example.com/diagram.png) | [TSK-42](bbtask://TSK-42) | [Fix login](bbthread://thr_test) |",
      "",
      "Edit here",
    ].join("\n");
    const onChange = vi.fn();
    const editorRef: { current: Editor | null } = { current: null };
    render(
      <TasksEditor
        value={value}
        onChange={onChange}
        onEditorReady={(ready) => (editorRef.current = ready)}
      />,
    );

    (editorRef.current ?? missingValue("Expected editor"))
      .chain()
      .focus("end")
      .insertContent(" elsewhere")
      .run();

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(`${value} elsewhere`));
  });

  it("ignores Markdown table alignment before and after an unrelated edit and reload", async () => {
    const value = "| Item | Owner |\n| :--- | ---: |\n| Parser | Ada |\n\nEdit here";
    const onChange = vi.fn<(markdown: string) => void>();
    const editorRef: { current: Editor | null } = { current: null };
    const initial = render(
      <TasksEditor
        value={value}
        onChange={onChange}
        onEditorReady={(ready) => (editorRef.current = ready)}
      />,
    );
    const readTable = ({ getAllByRole }: ReturnType<typeof render>) =>
      [...getAllByRole("columnheader"), ...getAllByRole("cell")].map((cell) => [
        cell.textContent,
        cell.getAttribute("align"),
        cell.style.textAlign,
      ]);
    const loadedCells = readTable(initial);

    (editorRef.current ?? missingValue("Expected editor"))
      .chain()
      .focus("end")
      .insertContent(" elsewhere")
      .run();

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        "| Item | Owner |\n| --- | --- |\n| Parser | Ada |\n\nEdit here elsewhere",
      ),
    );
    const [saved] = onChange.mock.lastCall ?? missingValue("Expected onChange.mock.lastCall");
    initial.unmount();
    const reloaded = render(<TasksEditor value={saved} onChange={onChange} />);
    const expectedCells = [
      ["Item", null, ""],
      ["Owner", null, ""],
      ["Parser", null, ""],
      ["Ada", null, ""],
    ];
    expect(readTable(reloaded)).toEqual(expectedCells);
    expect(loadedCells).toEqual(expectedCells);
  });

  it("retains merged and multi-block table cells after an unrelated edit and reload", () => {
    const editor = new Editor({
      extensions: createEditorExtensions(),
      content:
        '<table><tbody><tr><th colspan="2"><p>Heading</p></th></tr><tr><td><p>First</p><p>Second</p></td><td><p>Other</p></td></tr></tbody></table>\n\nEdit here',
    });
    try {
      editor.commands.insertContentAt(editor.state.doc.content.size - 1, " elsewhere");
      const saved = editor.storage.markdown.getMarkdown();
      expect(saved).toContain('<th colspan="2"');
      expect(saved).toContain("<p>First</p><p>Second</p>");
      expect(saved).toContain("Edit here elsewhere");
      editor.commands.setContent(saved);
      expect(editor.view.dom.querySelector("th")?.colSpan).toBe(2);
      expect(
        [...editor.view.dom.querySelectorAll("td:first-child p")].map((p) => p.textContent),
      ).toEqual(["First", "Second"]);
      expect(editor.storage.markdown.getMarkdown()).toBe(saved);
    } finally {
      editor.destroy();
    }
  });

  it("renders table headers and cells", () => {
    const screen = render(
      <TasksEditor
        value={"| Item | Owner |\n| --- | --- |\n| Parser | Ada |"}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByRole("table").closest(".tableWrapper")).toBeTruthy();
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    expect(screen.getAllByRole("cell")).toHaveLength(2);
  });
});

describe("mention extension", () => {
  it("parses a bbtask link into a pill node and serializes it back", () => {
    const editor = new Editor({
      extensions: createEditorExtensions(),
      content:
        "Ping [TSK-42](bbtask://TSK-42) and [Review](bbthread://thr_review), see [docs](https://example.com).\n\nEdit here",
    });
    const findMentions = () => {
      const found: Record<string, unknown>[] = [];
      editor.state.doc.descendants((node) => {
        if (node.type.name === "taskMention") found.push(node.attrs as Record<string, unknown>);
      });
      return found;
    };
    try {
      expect(findMentions()).toEqual([{ key: "TSK-42", label: "TSK-42" }]);
      const pill = editor.view.dom.querySelector('[data-task-mention="TSK-42"]');
      expect(pill?.classList.contains("bb-tasks-mention")).toBe(true);
      expect(pill?.textContent).toBe("TSK-42");
      expect(editor.view.dom.querySelector('[data-thread-mention="thr_review"]')?.textContent).toBe(
        "Review",
      );
      expect(editor.view.dom.querySelector('a[href="https://example.com"]')?.textContent).toBe(
        "docs",
      );
      editor
        .chain()
        .insertContentAt(editor.state.doc.content.size - 1, " elsewhere")
        .run();
      expect(editor.storage.markdown.getMarkdown()).toBe(
        "Ping [TSK-42](bbtask://TSK-42) and [Review](bbthread://thr_review), see [docs](https://example.com).\n\nEdit here elsewhere",
      );
      editor.commands.setContent("[docs](https://example.com)");
      expect(findMentions()).toEqual([]);
      expect(editor.storage.markdown.getMarkdown()).toBe("[docs](https://example.com)");
    } finally {
      editor.destroy();
    }
  });

  it("suggests and inserts mentions from the mentionItems prop", async () => {
    const instanceRef: { current: Editor | null } = { current: null };
    const onChange = vi.fn();
    const screen = render(
      <TasksEditor
        value=""
        onChange={onChange}
        mentionItems={(query) =>
          Promise.resolve(
            [
              {
                type: "task" as const,
                id: "1",
                key: "TSK-42",
                title: "Round-trip review",
              },
              {
                type: "task" as const,
                id: "2",
                key: "TSK-7",
                title: "Detail panel",
              },
            ].filter((item) => item.key.toLowerCase().includes(query.toLowerCase())),
          )
        }
        onEditorReady={(editor) => {
          instanceRef.current = editor;
        }}
      />,
    );
    expect(instanceRef.current).not.toBeNull();
    (instanceRef.current ?? missingValue("Expected instance"))
      .chain()
      .focus()
      .insertContent("@")
      .run();
    const option = await screen.findByText("Round-trip review");
    fireEvent.click(option.closest("button") ?? missingValue('Expected option.closest("button")'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("[TSK-42](bbtask://TSK-42) "));
    expect(screen.container.querySelector('[data-task-mention="TSK-42"]')).toBeTruthy();
  });

  it("stays inert without a mentionItems prop", async () => {
    const instanceRef: { current: Editor | null } = { current: null };
    const screen = render(
      <TasksEditor
        value=""
        onChange={() => undefined}
        onEditorReady={(editor) => {
          instanceRef.current = editor;
        }}
      />,
    );
    (instanceRef.current ?? missingValue("Expected instance"))
      .chain()
      .focus()
      .insertContent("@")
      .run();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("offers a Threads section and inserts a thread pill", async () => {
    const instanceRef: { current: Editor | null } = { current: null };
    const onChange = vi.fn();
    const screen = render(
      <TasksEditor
        value=""
        onChange={onChange}
        mentionItems={() =>
          Promise.resolve([
            {
              type: "task" as const,
              id: "1",
              key: "TSK-42",
              title: "Round-trip review",
            },
            {
              type: "thread" as const,
              id: "thr_a82u8wp8qq",
              title: "Fix login flow",
            },
          ])
        }
        onEditorReady={(editor) => {
          instanceRef.current = editor;
        }}
      />,
    );
    (instanceRef.current ?? missingValue("Expected instance"))
      .chain()
      .focus()
      .insertContent("@")
      .run();
    await screen.findByText("Threads");
    expect(screen.getByText("Tasks")).toBeTruthy();
    fireEvent.click(
      screen.getByText("Fix login flow").closest("button") ??
        missingValue("Expected a non-null value"),
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith("[Fix login flow](bbthread://thr_a82u8wp8qq) "),
    );
    expect(screen.container.querySelector('[data-thread-mention="thr_a82u8wp8qq"]')).toBeTruthy();
  });
});

describe("thread mention extension", () => {
  it("parses a bbthread link into a pill and serializes it back", () => {
    const editor = new Editor({
      extensions: createEditorExtensions(),
      content: "See [Fix login flow](bbthread://thr_a82u8wp8qq).",
    });
    try {
      const pill = editor.view.dom.querySelector('[data-thread-mention="thr_a82u8wp8qq"]');
      expect(pill?.classList.contains("bb-tasks-thread-mention")).toBe(true);
      expect(pill?.textContent).toBe("Fix login flow");
      expect(pill?.querySelector("svg.bb-tasks-mention-icon")).toBeTruthy();
      expect(editor.storage.markdown.getMarkdown()).toBe(
        "See [Fix login flow](bbthread://thr_a82u8wp8qq).",
      );
    } finally {
      editor.destroy();
    }
  });

  it("opens the thread when a pill is clicked", () => {
    const onOpenThread = vi.fn();
    const screen = render(
      <TasksEditor
        value="See [Fix login flow](bbthread://thr_a82u8wp8qq)."
        onChange={() => undefined}

        variant="compact"
        onOpenThread={onOpenThread}
      />,
    );
    const pill = screen.container.querySelector('[data-thread-mention="thr_a82u8wp8qq"]');
    fireEvent.click(pill ?? missingValue("Expected pill"));
    expect(onOpenThread).toHaveBeenCalledWith("thr_a82u8wp8qq");
  });
});

describe("heading toggle", () => {
  function editorWith(markdown: string): Editor {
    return new Editor({
      extensions: createEditorExtensions(),
      content: markdown,
    });
  }

  function selectBlocks(editor: Editor, fromBlock: number, toBlock = fromBlock) {
    const positions: number[] = [];
    editor.state.doc.forEach((_node, offset) => {
      positions.push(offset + 2);
    });
    editor.commands.setTextSelection({
      from: positions[fromBlock - 1] ?? missingValue("Expected positions[fromBlock - 1]"),
      to: positions[toBlock - 1] ?? missingValue("Expected positions[toBlock - 1]"),
    });
  }

  it("converts only the block under a within-block selection", () => {
    const editor = editorWith("First\n\nSecond\n\nThird");
    try {
      selectBlocks(editor, 2);
      editor.chain().toggleHeading({ level: 2 }).run();
      expect(editor.storage.markdown.getMarkdown()).toBe("First\n\n## Second\n\nThird");
    } finally {
      editor.destroy();
    }
  });

  it("converts only intersecting blocks for a multi-block selection", () => {
    const editor = editorWith("First\n\nSecond\n\nThird");
    try {
      selectBlocks(editor, 2, 3);
      editor.chain().toggleHeading({ level: 2 }).run();
      expect(editor.storage.markdown.getMarkdown()).toBe("First\n\n## Second\n\n## Third");
    } finally {
      editor.destroy();
    }
  });

  it("toggles a heading back to a paragraph", () => {
    const editor = editorWith("First\n\n## Second\n\nThird");
    try {
      selectBlocks(editor, 2);
      editor.chain().toggleHeading({ level: 2 }).run();
      expect(editor.storage.markdown.getMarkdown()).toBe("First\n\nSecond\n\nThird");
    } finally {
      editor.destroy();
    }
  });

  it("converts only the caret's block with no selection", () => {
    const editor = editorWith("First\n\nSecond\n\nThird");
    try {
      selectBlocks(editor, 3);
      editor.commands.setTextSelection(editor.state.selection.from);
      editor.chain().toggleHeading({ level: 2 }).run();
      expect(editor.storage.markdown.getMarkdown()).toBe("First\n\nSecond\n\n## Third");
    } finally {
      editor.destroy();
    }
  });
});

describe("TasksEditor component", () => {
  it("renders checklists and reports checkbox toggles as markdown", async () => {
    const onChange = vi.fn();
    const screen = render(<TasksEditor value={"- [ ] write tests"} onChange={onChange} />);
    const checkbox = screen.container.querySelector<HTMLInputElement>(
      'ul[data-type="taskList"] input[type="checkbox"]',
    );
    expect(checkbox).toBeTruthy();
    fireEvent.click(checkbox ?? missingValue("Expected checkbox"));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("- [x] write tests"));
  });

  it("renders the compact editor without a toolbar", () => {
    const screen = render(
      <TasksEditor value={"**Done** deal"} onChange={() => undefined} variant="compact" />,
    );
    expect(screen.queryByRole("toolbar")).toBeNull();
    const surface = screen.container.querySelector(".tiptap");
    expect(surface?.getAttribute("contenteditable")).toBe("true");
    expect(surface?.querySelector("strong")?.textContent).toBe("Done");
    expect(screen.container.querySelector('[data-variant="compact"]')).toBeTruthy();
  });

  it("renders pasted Markdown as rich content", async () => {
    const markdown = "| Task |\n| --- |\n| [TSK-42](bbtask://TSK-42) |";
    const onChange = vi.fn();
    const screen = render(<TasksEditor value="" onChange={onChange} />);

    fireEvent.paste(getEditorSurface(screen.container), {
      clipboardData: {
        files: [],
        getData: (type: string) => (type === "text/plain" ? markdown : ""),
      },
    });

    await waitFor(() => expect(screen.getByRole("table")).toBeTruthy());
    expect(screen.container.querySelector('[data-task-mention="TSK-42"]')).toBeTruthy();
    expect(onChange.mock.lastCall?.[0]?.trimEnd()).toBe(markdown);
  });

  it.each([
    {
      name: "plain paste",
      value: "",
      text: "# literal",
      shift: true,
      html: "",
      expected: "\\# literal",
    },
    {
      name: "code context",
      value: "```\ncode\n```",
      text: " **literal**",
      shift: false,
      html: "",
      expected: "```\ncode **literal**\n```",
    },
    {
      name: "interior whitespace",
      value: "",
      text: "left   right",
      shift: false,
      html: "",
      expected: "left   right",
    },
    {
      name: "HTML clipboard precedence",
      value: "",
      text: "**ignored**",
      shift: false,
      html: "<p><em>HTML</em></p>",
      expected: "*HTML*",
    },
  ])("preserves $name at the paste boundary", async ({ value, text, shift, html, expected }) => {
    const onChange = vi.fn();
    const editorRef: { current: Editor | null } = { current: null };
    const screen = render(
      <TasksEditor
        value={value}
        onChange={onChange}
        onEditorReady={(ready) => (editorRef.current = ready)}
      />,
    );
    (editorRef.current ?? missingValue("Expected editor")).commands.setTextSelection(
      (editorRef.current ?? missingValue("Expected editor")).state.doc.content.size - 1,
    );
    const surface = getEditorSurface(screen.container);
    fireEvent.keyDown(surface, {
      key: shift ? "Shift" : "v",
      keyCode: shift ? 16 : 86,
      shiftKey: shift,
    });
    fireEvent.paste(surface, {
      clipboardData: {
        files: [],
        getData: (type: string) =>
          type === "text/html" ? html : type === "text/plain" ? text : "",
      },
    });
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expected));
  });

  it("routes pasted and dropped files to onAttachFiles instead of inline upload", () => {
    const onAttachFiles = vi.fn();
    const onUploadImage = vi.fn();
    const editorRef: { current: Editor | null } = { current: null };
    render(
      <TasksEditor
        value=""
        onChange={() => undefined}
        onAttachFiles={onAttachFiles}
        onUploadImage={onUploadImage}
        onEditorReady={(ready) => (editorRef.current = ready)}
      />,
    );
    const { handlePaste, handleDrop } = (editorRef.current ?? missingValue("Expected editor"))
      .options.editorProps;
    const file = new File(["png"], "shot.png", { type: "image/png" });

    const pasteEvent = {
      clipboardData: { files: [file] },
    } as unknown as ClipboardEvent;
    expect(
      (handlePaste ?? missingValue("Expected handlePaste")).call(
        (editorRef.current ?? missingValue("Expected editor")).view,
        (editorRef.current ?? missingValue("Expected editor")).view,
        pasteEvent,
        null as never,
      ),
    ).toBe(true);
    expect(onAttachFiles).toHaveBeenCalledWith([file]);
    expect(onUploadImage).not.toHaveBeenCalled();

    const textPaste = {
      clipboardData: { files: [] },
    } as unknown as ClipboardEvent;
    expect(
      (handlePaste ?? missingValue("Expected handlePaste")).call(
        (editorRef.current ?? missingValue("Expected editor")).view,
        (editorRef.current ?? missingValue("Expected editor")).view,
        textPaste,
        null as never,
      ),
    ).toBe(false);

    const preventDefault = vi.fn();
    const dropEvent = {
      dataTransfer: { files: [file] },
      preventDefault,
    } as unknown as DragEvent;
    expect(
      (handleDrop ?? missingValue("Expected handleDrop")).call(
        (editorRef.current ?? missingValue("Expected editor")).view,
        (editorRef.current ?? missingValue("Expected editor")).view,
        dropEvent,
        null as never,
        false,
      ),
    ).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(onAttachFiles).toHaveBeenCalledTimes(2);
  });

  it("replaces external values silently and keeps the caret on an identical local echo", async () => {
    const onChange = vi.fn();
    const editorRef: { current: Editor | null } = { current: null };
    const ready = (instance: Editor) => (editorRef.current = instance);
    const screen = render(
      <TasksEditor value="original" onChange={onChange} onEditorReady={ready} />,
    );
    screen.rerender(<TasksEditor value="replaced" onChange={onChange} onEditorReady={ready} />);
    await screen.findByText("replaced");
    expect(onChange).not.toHaveBeenCalled();
    (editorRef.current ?? missingValue("Expected editor")).commands.insertContentAt(9, " locally");
    (editorRef.current ?? missingValue("Expected editor")).commands.setTextSelection(3);
    await waitFor(() => expect(onChange).toHaveBeenCalledExactlyOnceWith("replaced locally"));
    const surface = getEditorSurface(screen.container);
    screen.rerender(
      <TasksEditor value="replaced locally" onChange={onChange} onEditorReady={ready} />,
    );
    expect(getEditorSurface(screen.container)).toBe(surface);
    expect((editorRef.current ?? missingValue("Expected editor")).state.selection.from).toBe(3);
    expect(
      (editorRef.current ?? missingValue("Expected editor")).storage.markdown.getMarkdown(),
    ).toBe("replaced locally");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("stays editable when the description is only a single image", async () => {
    const editorRef: { current: Editor | null } = { current: null };
    render(
      <TasksEditor
        value={"![shot](https://example.com/a.png)"}
        onChange={() => undefined}
        onEditorReady={(ready) => (editorRef.current = ready)}
      />,
    );
    (editorRef.current ?? missingValue("Expected editor"))
      .chain()
      .focus("end")
      .insertContent("caption")
      .run();
    await waitFor(() => {
      const markdown = (
        editorRef.current ?? missingValue("Expected editor")
      ).storage.markdown.getMarkdown() as string;
      expect(markdown).toContain("![shot](https://example.com/a.png)");
      expect(markdown).toContain("caption");
    });
  });
});

describe("TasksEditor typing", () => {
  it.each([false, true])("keeps multiline typing with Shift=%s", (shiftKey) => {
    const editorRef: { current: Editor | null } = { current: null };
    const screen = render(
      <TasksEditor
        value="First"
        onChange={() => undefined}
        onEditorReady={(ready) => {
          editorRef.current = ready;
        }}
      />,
    );
    (editorRef.current ?? missingValue("Expected editor")).commands.focus("end");
    const surface = getEditorSurface(screen.container);
    expect(surface.getAttribute("enterkeyhint")).toBeNull();
    fireEvent.keyDown(surface, { key: "Enter", shiftKey });
    (editorRef.current ?? missingValue("Expected editor")).commands.insertContent("Second");
    const blocks =
      (editorRef.current ?? missingValue("Expected editor")).getJSON().content ??
      missingValue("Expected a non-null value");
    if (shiftKey) {
      expect(blocks).toHaveLength(1);
      expect((blocks[0] ?? missingValue("Expected blocks[0]")).content).toContainEqual({
        type: "hardBreak",
      });
    } else {
      expect(blocks).toHaveLength(2);
    }
    expect((editorRef.current ?? missingValue("Expected editor")).getText()).toContain("Second");
  });
  it("lets the mention popover own Enter while open", async () => {
    const editorRef: { current: Editor | null } = { current: null };
    const screen = render(
      <TasksEditor
        value=""
        onChange={() => undefined}
        variant="compact"
        mentionItems={() =>
          Promise.resolve([
            {
              type: "task" as const,
              id: "1",
              key: "TSK-1",
              title: "Pick me",
            },
          ])
        }
        onEditorReady={(ready) => {
          editorRef.current = ready;
        }}
      />,
    );
    (editorRef.current ?? missingValue("Expected editor")).chain().focus().insertContent("@").run();
    await screen.findByText("Pick me");
    fireEvent.keyDown(getEditorSurface(screen.container), { key: "Enter" });
    await waitFor(() =>
      expect(screen.container.querySelector('[data-task-mention="TSK-1"]')).toBeTruthy(),
    );
  });
});
