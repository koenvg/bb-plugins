import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import hostEntry from "../../bb-plugin-github-insight/host";
import { createMediaSigner } from "../../bb-plugin-github-insight/core/signed-media";
import { createReviewService } from "../../bb-plugin-github-insight/review/review-service";

const [owner, repo, out, prNumber] = process.argv.slice(2) as [string, string, string, string];
const number = Number(prNumber);
const handlers = (
  hostEntry as unknown as { handlers: Record<string, (r: unknown, c: unknown) => Promise<any>> }
).handlers;
const context = { signal: new AbortController().signal };

function crc32(bytes: Uint8Array) {
  let c = ~0;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Uint8Array) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
const w = 240,
  h = 80;
const raw = Buffer.alloc((w * 3 + 1) * h);
for (let y = 0; y < h; y++)
  for (let x = 0; x < w; x++) raw.set([x, 120, 255 - x], y * (w * 3 + 1) + 1 + x * 3);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(w, 0);
ihdr.writeUInt32BE(h, 4);
ihdr.set([8, 2, 0, 0, 0], 8);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw)),
  chunk("IEND", new Uint8Array()),
]);
writeFileSync(join(out, "probe.png"), png);
writeFileSync(join(out, "not-image.png"), "hello");

const notImage = await handlers.uploadImage!(
  { owner, repo, path: "not-image.png", cwd: out },
  context,
);
console.log("not an image ->", JSON.stringify(notImage));
const uploaded = await handlers.uploadImage!({ owner, repo, path: "probe.png", cwd: out }, context);
console.log("upload ->", JSON.stringify(uploaded));
if (!uploaded.ok) process.exit(1);

const body = `Gradient probe\n\n<img alt="probe" src="${uploaded.url}">`;
const target = { ref: { owner, repo, number }, hostId: "local" };
const unwrap = (r: any) => {
  if (!r.ok) throw new Error(JSON.stringify(r.failure));
  return r.data;
};
const service = createReviewService({
  resolvePr: async () => ({ kind: "pr", target }),
  renderMarkdown: async (_t: unknown, text: string) => {
    const r = await handlers.renderMarkdown!({ owner, repo, text }, context);
    if (!r.ok) throw new Error(JSON.stringify(r.failure));
    return r.html;
  },
  drafts: {
    knownDrafts: async () => ({}),
    comments: async () => [
      {
        id: "d1",
        path: "a",
        side: "RIGHT",
        line: 1,
        startLine: null,
        commitOid: "x",
        body,
        updatedAt: 0,
        source: "agent",
      },
    ],
    summary: async () => null,
  },
  fetchPrHead: async () => unwrap(await handlers.fetchPrHead!({ owner, repo, number }, context)),
  fetchPrFilesPage: async (_t: unknown, page: number) =>
    unwrap(await handlers.fetchPrFiles!({ owner, repo, number, page }, context)),
  fetchReviewThreadsPage: async (_t: unknown, after: string | null) =>
    unwrap(await handlers.fetchReviewThreads!({ owner, repo, number, after }, context)),
  signMedia: createMediaSigner(Date.now),
} as any);
const loaded: any = await (service as any).loadDrafts("thr");
console.log("draftMedia ->", JSON.stringify(loaded.drafts?.draftMedia ?? loaded).slice(0, 220));
const signed = Object.values(loaded.drafts?.draftMedia ?? {})[0] as string | undefined;
if (signed) {
  const res = await fetch(signed);
  console.log(
    "signed fetch ->",
    res.status,
    res.headers.get("content-type"),
    (await res.arrayBuffer()).byteLength,
    "bytes",
  );
}
const anon = await fetch(uploaded.url, { redirect: "manual" });
console.log("anonymous original url ->", anon.status);
