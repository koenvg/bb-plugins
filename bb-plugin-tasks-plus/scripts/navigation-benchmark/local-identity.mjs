// The generated fixture uses only headings, plain paragraphs, lists and one link.
export const normalizeText = (text) => text.replace(/\s+/g, " ").trim();
export function descriptionText(markdown) {
  return normalizeText(
    markdown
      .split("\n")
      .map((line) =>
        line
          .replace(/^#{1,6} /, "")
          .replace(/^- /, "")
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"),
      )
      .join(" "),
  );
}
export function qualifiesContent(state, task) {
  return (
    state.rowKey === task.key &&
    state.detailKey === task.key &&
    state.heading === task.title &&
    state.marker === task.marker &&
    state.rowTitle === task.title &&
    state.rowVisible &&
    state.visible &&
    state.rendered &&
    normalizeText(state.descriptionText ?? "") === descriptionText(task.description) &&
    state.linkHref === "https://example.com/benchmark"
  );
}
export function readFullTicket(document, readNativeTicket) {
  const state = readNativeTicket(document);
  const description = document.querySelector(
    `[data-detail-key="${state.detailKey}"] .bb-tasks-editor[data-variant="doc"] .tiptap`,
  );
  const row = document.querySelector('[data-selected="true"] .task-list-title');
  const rowVisible = Boolean(
    row &&
    !row.closest('[hidden],[inert],[aria-hidden="true"]') &&
    [...row.getClientRects()].some(
      (rect) =>
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < document.defaultView.innerHeight &&
        rect.left < document.defaultView.innerWidth,
    ),
  );
  return {
    ...state,
    rowVisible,
    rowTitle: document.querySelector('[data-selected="true"] .task-list-title')?.textContent,
    descriptionText: [...(description?.querySelectorAll("h2,p,li") ?? [])]
      .filter((node) => node.tagName !== "LI" || !node.querySelector("p"))
      .map((node) => node.textContent)
      .join(" "),
    linkHref: description?.querySelector("a")?.getAttribute("href"),
  };
}
