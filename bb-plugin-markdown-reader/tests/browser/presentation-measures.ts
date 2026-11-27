// Controlled fixture measurements, not installed BB theme certification.
export function geometry(e: HTMLElement) {
  function query<T extends Element = Element>(root: ParentNode, selector: string): T {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing fixture element: ${selector}`);
    return element;
  }
  const rect = e.getBoundingClientRect();
  const prose = query(e, ".mr-prose");
  const layout = query<HTMLElement>(e, ".mr-document-layout");
  const lr = layout.getBoundingClientRect();
  const toolbar = query(e, ".mr-toolbar");
  const tr = toolbar.getBoundingClientRect();
  const ps = getComputedStyle(prose);
  const h2 = getComputedStyle(query(prose, "h2"));
  const image = query<HTMLImageElement>(prose, "img");
  const ir = image.getBoundingClientRect();
  const filename = query(toolbar, ".mr-filename");
  return {
    width: e.clientWidth,
    scrollWidth: e.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    proseWidth: prose.clientWidth,
    proseFont: ps.fontSize,
    lineHeight: ps.lineHeight,
    layoutWidth: lr.width,
    leftSpace: lr.left - rect.left,
    rightSpace: rect.right - lr.right,
    padding: getComputedStyle(query(e, ".mr-content")).padding,
    sectionAbove: h2.marginTop,
    sectionBelow: h2.marginBottom,
    outline: layout.dataset.outline,
    titleLines: query(prose, "h1").getBoundingClientRect().height,
    pathTruncated: filename.scrollWidth > filename.clientWidth,
    buttons: Array.from(toolbar.querySelectorAll("button")).map((b) => {
      const r = b.getBoundingClientRect();
      return {
        name: b.textContent,
        width: r.width,
        height: r.height,
        inside:
          r.left >= tr.left && r.right <= tr.right && r.top >= tr.top && r.bottom <= tr.bottom,
      };
    }),
    code: Array.from(prose.querySelectorAll("pre")).map((c) => ({
      width: c.clientWidth,
      scrollWidth: c.scrollWidth,
    })),
    tables: Array.from(prose.querySelectorAll(".mr-table-scroll")).map((c) => ({
      width: c.clientWidth,
      scrollWidth: c.scrollWidth,
    })),
    image: {
      width: ir.width,
      height: ir.height,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    },
  };
}

export function contrast() {
  const root = document.querySelector(".markdown-reader");
  const prose = root?.querySelector(".mr-prose");
  const controls = root?.querySelector(".mr-view-controls");
  if (!root || !prose || !controls) {
    throw new Error("Markdown reader contrast fixture is incomplete");
  }
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("No canvas context for contrast measurement");
  const pixel = (color: string, base: string | null = null) => {
    ctx.clearRect(0, 0, 1, 1);
    if (base) {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 1, 1);
    }
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    return Array.from(ctx.getImageData(0, 0, 1, 1).data);
  };
  const rgb = (rgba: number[]) => `rgb(${rgba.slice(0, 3).join(",")})`;
  const luminance = (rgba: number[]) =>
    rgba
      .slice(0, 3)
      .map((value) => {
        const v = value / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a: number[], b: number[]) => {
    const x = luminance(a),
      y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const bg = getComputedStyle(root).backgroundColor,
    fg = getComputedStyle(prose).color;
  const bodyBg = pixel(bg),
    bodyFg = pixel(fg, bg);
  const tokens = Array.from(root.querySelectorAll("pre .token")).map((t) => {
    const codeBlock = t.closest("pre");
    if (!codeBlock) throw new Error("Code token has no block");
    const surface = getComputedStyle(codeBlock).backgroundColor;
    const background = pixel(surface, rgb(bodyBg)),
      foreground = pixel(getComputedStyle(t).color, rgb(background));
    return { class: t.className, foreground, background, ratio: ratio(foreground, background) };
  });
  return {
    body: {
      cssForeground: fg,
      cssBackground: bg,
      foreground: bodyFg,
      background: bodyBg,
      ratio: ratio(bodyFg, bodyBg),
    },
    tokenMin: Math.min(...tokens.map((t) => t.ratio)),
    tokens,
    radius: getComputedStyle(controls).borderRadius,
  };
}
