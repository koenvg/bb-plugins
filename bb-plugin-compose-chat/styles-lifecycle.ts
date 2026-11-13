const marker = "data-compose-chat";
const active = "active";

export function mountStyles({ signal }: { signal: AbortSignal }): () => void {
  if (signal.aborted) return () => {};
  const root = document.documentElement;
  const previous = root.getAttribute(marker);
  root.setAttribute(marker, active);
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    if (root.getAttribute(marker) !== active) return;
    if (previous === null) root.removeAttribute(marker);
    else root.setAttribute(marker, previous);
  };
  signal.addEventListener("abort", dispose, { once: true });
  return dispose;
}
