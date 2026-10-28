import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { prImageRequestSchema } from "../core/pr-image-basis";
import {
  imageBytes,
  imageError,
  imageShaSchema,
  MAX_IMAGE_BYTES,
  type ImageWireResult,
} from "../core/image-content";
import { prImageRefsSchema, type PrImageRefs } from "../core/pr-image-basis";

const run = promisify(execFile);
export function imageMergeBaseArgs(value: PrImageRefs): string[] {
  const { baseRepo, headRepo, baseSha, headSha } = prImageRefsSchema.parse(value);
  const comparison = `${baseSha}...${headRepo.owner}:${headSha}`;
  return [
    "api",
    `repos/${baseRepo.owner}/${baseRepo.repo}/compare/${encodeURIComponent(comparison)}`,
  ];
}
const contentsSchema = z.object({
  size: z.number().int().nonnegative(),
  sha: imageShaSchema,
  encoding: z.string(),
  content: z.string(),
});
const blobSchema = z.object({ encoding: z.literal("base64"), content: z.string() });
type RepoFileRead =
  | { ok: true; bytes: Buffer }
  | { ok: false; code: "too_large" | "auth" | "missing" | "read" };
export async function readRepoFile(
  value: z.infer<typeof prImageRequestSchema>,
  maxBytes: number,
  signal: AbortSignal,
): Promise<RepoFileRead> {
  const base64Bytes = Math.ceil(maxBytes / 3) * 4;
  const options = {
    signal,
    maxBuffer: base64Bytes + Math.ceil(base64Bytes / 60) * 2 + 65_536,
    timeout: 20_000,
  };
  try {
    const { owner, repo, sha, path } = prImageRequestSchema.parse(value);
    const contentsPath = path.split("/").map(encodeURIComponent).join("/");
    const { stdout } = await run(
      "gh",
      ["api", `repos/${owner}/${repo}/contents/${contentsPath}?ref=${encodeURIComponent(sha)}`],
      options,
    );
    const contents = contentsSchema.parse(JSON.parse(stdout));
    if (contents.size > maxBytes) return { ok: false, code: "too_large" };
    const content =
      contents.encoding === "base64" && contents.content !== ""
        ? contents.content
        : blobSchema.parse(
            JSON.parse(
              (
                await run(
                  "gh",
                  ["api", `repos/${owner}/${repo}/git/blobs/${contents.sha}`],
                  options,
                )
              ).stdout,
            ),
          ).content;
    const bytes = Buffer.from(content, "base64");
    return bytes.length === contents.size ? { ok: true, bytes } : { ok: false, code: "read" };
  } catch (error) {
    const fields = typeof error === "object" && error !== null ? error : {};
    if ("code" in fields && fields.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER")
      return { ok: false, code: "too_large" };
    const stderr = "stderr" in fields ? String(fields.stderr) : "";
    if (/\b(401|403)\b|authentication|not logged/i.test(stderr)) return { ok: false, code: "auth" };
    if (/\b404\b/.test(stderr)) return { ok: false, code: "missing" };
    return { ok: false, code: "read" };
  }
}
const imageFailures = {
  too_large: "Image exceeds the 4 MiB preview limit",
  auth: "GitHub credentials cannot read this image",
  missing: "Image not found at this revision",
  read: "Could not read image from GitHub. Retry or refresh the review.",
} as const;
export async function readPrImage(
  value: z.infer<typeof prImageRequestSchema>,
  signal: AbortSignal,
): Promise<ImageWireResult> {
  const file = await readRepoFile(value, MAX_IMAGE_BYTES, signal);
  return file.ok ? imageBytes(file.bytes) : imageError(file.code, imageFailures[file.code]);
}
