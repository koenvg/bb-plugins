/** Reveal only within this reader. Do not scroll another tab or change the URL. */
export function revealInReader(panel: HTMLElement, target: HTMLElement) {
  const toolbar = panel.querySelector(".mr-toolbar");
  if (!toolbar) {
    throw new Error("Markdown reader toolbar is missing.");
  }
  const toolbarHeight = toolbar.getBoundingClientRect().height;
  panel.scrollTop +=
    target.getBoundingClientRect().top - panel.getBoundingClientRect().top - toolbarHeight - 24;
  target.focus({ preventScroll: true });
}
