import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./themes/codex-inspired.css", import.meta.url), "utf8");

function declaration(selector: string): string {
  const start = css.indexOf(selector);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start) + 1);
}

describe("Libron reading typography", () => {
  it("embeds the original regular and bold web faces without runtime downloads", () => {
    const faces = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map((match) => match[1]!);
    expect(faces).toHaveLength(2);
    const hashes = [
      "e64c8420f5d21deb3fce8d45a6d9165827067de8c36262922ad5f56e6b0c37f4",
      "2c904e1af5a98879e7ea11089d7e1812e13574658849b9b1518d438f9379b75e",
    ];
    faces.forEach((face, index) => {
      expect(face).toContain('font-family: "Libron";');
      expect(face).toContain(`font-weight: ${index === 0 ? 400 : 700};`);
      expect(face).toContain("font-style: normal;");
      expect(face).toContain("font-display: swap;");
      const payload = /data:font\/woff2;base64,([A-Za-z0-9+/=]+)/.exec(face)![1]!;
      const bytes = Buffer.from(payload, "base64");
      expect(bytes.subarray(0, 4).toString()).toBe("wOF2");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(hashes[index]);
    });
    expect(css).not.toMatch(/url\(["']?https?:/);
    expect(css.length).toBeLessThanOrEqual(256_000);
    const license = readFileSync(new URL("./themes/libron/OFL.txt", import.meta.url), "utf8");
    expect(license).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(license).toContain("Nico Verbruggen");
    expect(license).toContain("Newsreader Project Authors");
  });

  it("scopes the reading face to chat Markdown and the file viewer's prose", () => {
    const reading = declaration("[data-message-column] [data-markdown-preview],");
    expect(reading).toContain(".markdown-reader .mr-prose");
    expect(reading).toContain('font-family: "Libron", Georgia, "Times New Roman", serif;');
    expect(reading).not.toContain("--font-sans:");
    expect(reading).not.toContain("font-size:");
    expect(reading).not.toContain("line-height:");
    expect(css).not.toContain(".mr-raw");
    expect(declaration('[data-sidebar="sidebar"] {')).toContain('"Inter Variable", Inter');
    expect(declaration('form[data-promptbox] [contenteditable="true"] {')).toContain(
      "font-family: var(--font-sans);",
    );
  });

  it("keeps controls sans and code monospaced inside reading surfaces", () => {
    expect(
      declaration(
        ":is([data-message-column] [data-markdown-preview], .markdown-reader .mr-prose)\n  :is(button",
      ),
    ).toContain("font-family: var(--font-sans);");
    expect(
      declaration(
        ":is([data-message-column] [data-markdown-preview], .markdown-reader .mr-prose)\n  :is(code",
      ),
    ).toContain("font-family: var(--font-mono);");
  });
});
