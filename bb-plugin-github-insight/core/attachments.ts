import { ASSET_ID } from "./signed-media";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export interface Attachment {
  alt: string;
  url: string;
}

export interface AttachSpec {
  path: string;
  alt: string;
}

const IMAGE_TYPES = [
  {
    type: "image/png",
    extension: ".png",
    named: /\.png$/i,
    magic: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  },
  { type: "image/jpeg", extension: ".jpg", named: /\.jpe?g$/i, magic: [[0xff, 0xd8, 0xff]] },
  {
    type: "image/gif",
    extension: ".gif",
    named: /\.gif$/i,
    magic: [ascii("GIF87a"), ascii("GIF89a")],
  },
] as const;

export type ImageContentType = (typeof IMAGE_TYPES)[number]["type"];

const ATTACHMENT_URL = new RegExp(`^https://github\\.com/user-attachments/assets/${ASSET_ID}$`);
const IMG_TAG = /<img\b[^>]*>/gi;
const ATTRIBUTE = /(?<![\w-])(alt|src)="([^"]*)"/gi;

function ascii(text: string): number[] {
  return [...text].map((character) => character.charCodeAt(0));
}

export function parseAttachSpec(raw: string): AttachSpec {
  const hash = raw.indexOf("#");
  const path = hash === -1 ? raw : raw.slice(0, hash);
  return { path, alt: hash === -1 ? stem(baseName(path)) : raw.slice(hash + 1) };
}

export function imageContentType(bytes: Uint8Array): ImageContentType | null {
  const found = IMAGE_TYPES.find(({ magic }) =>
    magic.some((prefix) => prefix.every((byte, index) => bytes[index] === byte)),
  );
  return found?.type ?? null;
}

export function attachmentFileName(path: string, type: ImageContentType): string {
  const name = baseName(path);
  const { named, extension } = IMAGE_TYPES.find((entry) => entry.type === type)!;
  return named.test(name) ? name : `${stem(name)}${extension}`;
}

export function attachmentTag({ alt, url }: Attachment): string {
  return `<img alt="${escapeHtml(alt)}" src="${url}">`;
}

export function withAttachments(body: string, images: readonly Attachment[]): string {
  if (images.length === 0) return body;
  const tags = images.map(attachmentTag).join("\n");
  const text = body.trimEnd();
  return text === "" ? tags : `${text}\n\n${tags}`;
}

export function isAttachmentUrl(url: string): boolean {
  return ATTACHMENT_URL.test(url);
}

export function draftAttachments(body: string): Attachment[] {
  const attachments: Attachment[] = [];
  for (const [tag] of body.matchAll(IMG_TAG)) {
    const attributes = new Map(
      [...tag.matchAll(ATTRIBUTE)].map(([, name, value]) => [name!.toLowerCase(), value!]),
    );
    const url = attributes.get("src");
    if (url === undefined || !isAttachmentUrl(url)) continue;
    attachments.push({ alt: unescapeHtml(attributes.get("alt") ?? ""), url });
  }
  return attachments;
}

function baseName(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path;
}

function stem(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function unescapeHtml(text: string): string {
  return text
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}
