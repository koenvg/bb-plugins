import { describe, expect, it } from "vitest";
import {
  attachmentFileName,
  attachmentTag,
  draftAttachments,
  imageContentType,
  parseAttachSpec,
  withAttachments,
} from "./attachments";

const URL_A = "https://github.com/user-attachments/assets/1bc7aa19-b5b1-40ea-95c8-ab8be878d7ba";
const URL_B = "https://github.com/user-attachments/assets/5676ccda-f9b1-4eb5-b1b2-b5370588b2b5";

describe("parseAttachSpec", () => {
  it("uses the file name without its extension as the alt text", () => {
    expect(parseAttachSpec("shots/before.png")).toEqual({
      path: "shots/before.png",
      alt: "before",
    });
  });

  it("splits the alt text at the first #", () => {
    expect(parseAttachSpec("shot.png#Step #2: the dialog")).toEqual({
      path: "shot.png",
      alt: "Step #2: the dialog",
    });
  });

  it("keeps an empty alt text after a trailing #", () => {
    expect(parseAttachSpec("shot.png#")).toEqual({ path: "shot.png", alt: "" });
  });

  it("keeps a dot file name as the alt text", () => {
    expect(parseAttachSpec(".hidden")).toEqual({ path: ".hidden", alt: ".hidden" });
  });
});

describe("imageContentType", () => {
  it.each([
    ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]],
    ["image/jpeg", [0xff, 0xd8, 0xff, 0xe0]],
    ["image/gif", [...Buffer.from("GIF87a")]],
    ["image/gif", [...Buffer.from("GIF89a!")]],
  ])("detects %s from the first bytes", (type, bytes) => {
    expect(imageContentType(Uint8Array.from(bytes))).toBe(type);
  });

  it.each([
    ["WebP", [...Buffer.from("RIFF\0\0\0\0WEBP")]],
    ["text", [...Buffer.from("hello world")]],
    ["a truncated PNG header", [0x89, 0x50, 0x4e]],
    ["nothing", []],
  ])("refuses %s", (_, bytes) => {
    expect(imageContentType(Uint8Array.from(bytes))).toBeNull();
  });
});

describe("attachmentFileName", () => {
  it.each([
    ["shots/a.png", "image/png", "a.png"],
    ["a.JPEG", "image/jpeg", "a.JPEG"],
    ["a.jpg", "image/jpeg", "a.jpg"],
    ["a.png", "image/jpeg", "a.jpg"],
    ["screenshot", "image/gif", "screenshot.gif"],
  ] as const)("names %s as %s: %s", (path, type, name) => {
    expect(attachmentFileName(path, type)).toBe(name);
  });
});

describe("withAttachments", () => {
  it("adds one image tag per line after a blank line", () => {
    expect(
      withAttachments("Broken layout\n\n", [
        { alt: "before", url: URL_A },
        { alt: "after", url: URL_B },
      ]),
    ).toBe(`Broken layout\n\n<img alt="before" src="${URL_A}">\n<img alt="after" src="${URL_B}">`);
  });

  it("is only the tags when the text is empty", () => {
    expect(withAttachments("  \n", [{ alt: "shot", url: URL_A }])).toBe(
      `<img alt="shot" src="${URL_A}">`,
    );
  });

  it("keeps the text unchanged without images", () => {
    expect(withAttachments("Text  \n", [])).toBe("Text  \n");
  });

  it("escapes the alt text", () => {
    expect(attachmentTag({ alt: `a "b" <c> & d`, url: URL_A })).toBe(
      `<img alt="a &quot;b&quot; &lt;c&gt; &amp; d" src="${URL_A}">`,
    );
  });
});

describe("draftAttachments", () => {
  it("reads back the images that withAttachments added", () => {
    const images = [
      { alt: `a "b" <c> & d`, url: URL_A },
      { alt: "", url: URL_B },
    ];

    expect(draftAttachments(withAttachments("Text", images))).toEqual(images);
  });

  it("reads an image tag the user wrote with other attributes", () => {
    expect(
      draftAttachments(`See <IMG width="300" src="${URL_A}" alt="dialog" data-x="1" />`),
    ).toEqual([{ alt: "dialog", url: URL_A }]);
  });

  it("skips images that are not GitHub attachments", () => {
    expect(
      draftAttachments(
        `<img alt="x" src="https://example.com/a.png"> <img alt="y" data-src="${URL_A}"> <img alt="z" src="${URL_A}/extra">`,
      ),
    ).toEqual([]);
  });

  it("finds nothing in plain text", () => {
    expect(draftAttachments(`Look at ${URL_A}`)).toEqual([]);
  });
});
