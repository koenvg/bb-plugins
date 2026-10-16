export function reportMeasures() {
  const root = document.querySelector<HTMLElement>(".md-document")!;
  const prose = root.querySelector<HTMLElement>(".mr-prose")!;
  const panel = root.closest(".attachment-preview")!;
  const body = panel.querySelector<HTMLElement>(".attachment-preview-body")!;
  const styles = getComputedStyle(prose);
  const local = (element: Element) => ({
    width: element.clientWidth,
    scrollWidth: element.scrollWidth,
    overflow: getComputedStyle(element).overflowX,
  });
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  const background = (element: Element) => {
    const ancestors: Element[] = [];
    for (let current: Element | null = element; current; current = current.parentElement)
      ancestors.unshift(current);
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = "white";
    context.fillRect(0, 0, 1, 1);
    for (const ancestor of ancestors) {
      context.fillStyle = getComputedStyle(ancestor).backgroundColor;
      context.fillRect(0, 0, 1, 1);
    }
    return Array.from(context.getImageData(0, 0, 1, 1).data);
  };
  const luminance = (rgba: number[]) =>
    rgba.slice(0, 3).reduce((sum, value, index) => {
      const v = value / 255;
      return (
        sum +
        (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index]!
      );
    }, 0);
  const contrast = (element: Element) => {
    const bg = background(element);
    const color = getComputedStyle(element).color;
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const fg = Array.from(context.getImageData(0, 0, 1, 1).data);
    const a = luminance(fg),
      b = luminance(bg);
    return {
      color,
      background: bg,
      foreground: fg,
      ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
    };
  };
  return {
    viewport: innerWidth,
    documentWidth: root.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
    prose: {
      width: prose.clientWidth,
      scrollWidth: prose.scrollWidth,
      font: styles.fontSize,
      lineHeight: styles.lineHeight,
    },
    body: {
      height: body.clientHeight,
      scrollHeight: body.scrollHeight,
      overflow: getComputedStyle(body).overflowY,
    },
    headings: Array.from(prose.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((heading) => {
      const style = getComputedStyle(heading);
      return {
        tag: heading.tagName,
        text: heading.textContent,
        font: style.fontSize,
        above: style.marginTop,
        below: style.marginBottom,
      };
    }),
    code: Array.from(prose.querySelectorAll("pre")).map(local),
    tables: Array.from(prose.querySelectorAll(".mr-table-scroll")).map(local),
    codeFont: getComputedStyle(prose.querySelector("pre")!).fontFamily,
    codeSize: getComputedStyle(prose.querySelector("pre")!).fontSize,
    codeLineHeight: getComputedStyle(prose.querySelector("pre")!).lineHeight,
    radius: getComputedStyle(prose.querySelector("pre")!).borderRadius,
    bodyContrast: contrast(prose),
    tokens: Array.from(prose.querySelectorAll("pre .token")).map((token) => ({
      class: token.className,
      text: token.textContent,
      ...contrast(token),
    })),
    controls: Array.from(
      panel.querySelectorAll(".attachment-preview-toolbar button, .attachment-preview-toolbar a"),
    ).map((control) => {
      const rect = control.getBoundingClientRect();
      return {
        name: control.textContent,
        inside:
          rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
      };
    }),
  };
}

export function sentinelMeasures() {
  return Array.from(
    document.querySelectorAll(
      ".fixture-editor h2, .fixture-editor p, .fixture-editor code, .fixture-chat h2, .fixture-chat pre, .fixture-chat code, .fixture-chat td",
    ),
  ).map((element) => {
    const style = getComputedStyle(element);
    return {
      tag: element.tagName,
      font: style.fontSize,
      lineHeight: style.lineHeight,
      margin: style.margin,
      padding: style.padding,
      background: style.backgroundColor,
      weight: style.fontWeight,
      decoration: style.textDecorationLine,
    };
  });
}
