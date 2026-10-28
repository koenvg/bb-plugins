import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { imageShaSchema } from "../core/image-content";
import { repoFileSchema, type RepoFile } from "../core/repo-file";

const run = promisify(execFile);
const contentsSchema = z.object({
  size: z.number().int().nonnegative(),
  sha: imageShaSchema,
  encoding: z.string(),
  content: z.string(),
});
const blobSchema = z.object({ encoding: z.literal("base64"), content: z.string() });
type GhOptions = { signal: AbortSignal; maxBuffer: number; timeout: number };
type RepoFileRead =
  | { ok: true; bytes: Buffer }
  | { ok: false; code: "too_large" | "auth" | "missing" | "read" };

async function ghJson<T>(path: string, schema: z.ZodType<T>, options: GhOptions): Promise<T> {
  const { stdout } = await run("gh", ["api", path], options);
  return schema.parse(JSON.parse(stdout));
}

function base64JsonBudget(maxBytes: number): number {
  const base64Bytes = Math.ceil(maxBytes / 3) * 4;
  const escapedNewlines = Math.ceil(base64Bytes / 60) * 2;
  return base64Bytes + escapedNewlines + 65_536;
}

export async function readRepoFile(
  file: RepoFile,
  maxBytes: number,
  signal: AbortSignal,
): Promise<RepoFileRead> {
  const options = { signal, maxBuffer: base64JsonBudget(maxBytes), timeout: 20_000 };
  try {
    const { owner, repo, sha, path } = repoFileSchema.parse(file);
    const contentsPath = path.split("/").map(encodeURIComponent).join("/");
    const contents = await ghJson(
      `repos/${owner}/${repo}/contents/${contentsPath}?ref=${encodeURIComponent(sha)}`,
      contentsSchema,
      options,
    );
    if (contents.size > maxBytes) return { ok: false, code: "too_large" };
    const inline = contents.encoding === "base64" && contents.content !== "";
    const content = inline
      ? contents.content
      : (await ghJson(`repos/${owner}/${repo}/git/blobs/${contents.sha}`, blobSchema, options))
          .content;
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
