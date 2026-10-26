import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import type { UploadImageRequest, UploadImageResult } from "../contract";
import {
  attachmentFileName,
  imageContentType,
  isAttachmentUrl,
  MAX_ATTACHMENT_BYTES,
  type ImageContentType,
} from "../core/attachments";
import { classifyGhFailure, ghFailureText, ghProcessError } from "./gh-failure";

export interface UploadImageDeps {
  fetch: typeof fetch;
  gh(args: string[], signal: AbortSignal): Promise<string>;
}

type Step<T> = { ok: true; value: T } | { ok: false; message: string };
type Attempt = { kind: "done"; result: UploadImageResult } | { kind: "retry"; message: string };

const UPLOAD_ATTEMPTS = 3;
const UPLOAD_TIMEOUT_MS = 45_000;
const uploadedSchema = z.object({ url: z.string().refine(isAttachmentUrl) });
const githubErrorSchema = z.object({
  message: z.string().optional(),
  errors: z.array(z.object({ message: z.string() }).partial()).optional(),
});

export async function uploadImage(
  { owner, repo, path, cwd }: UploadImageRequest,
  signal: AbortSignal,
  deps: UploadImageDeps,
): Promise<UploadImageResult> {
  const image = await readImage(path, cwd);
  if (!image.ok) return image;
  const repositoryId = await ghOutput(
    deps,
    ["api", `repos/${owner}/${repo}`, "--jq", ".id"],
    signal,
  );
  if (!repositoryId.ok) return repositoryId;
  const token = await ghOutput(deps, ["auth", "token"], signal);
  if (!token.ok) return token;
  const { bytes, type } = image.value;
  const url = new URL("https://uploads.github.com/user-attachments/assets");
  url.searchParams.set("content_type", type);
  url.searchParams.set("name", attachmentFileName(path, type));
  url.searchParams.set("repository_id", repositoryId.value);
  const request: RequestInit = {
    method: "POST",
    headers: { Authorization: `token ${token.value}`, "Content-Type": type },
    body: bytes,
  };
  for (let tries = 1; ; tries++) {
    const attempt = await post(deps.fetch, url, request, signal);
    if (attempt.kind === "done") return attempt.result;
    if (tries === UPLOAD_ATTEMPTS) return { ok: false, message: attempt.message };
  }
}

async function readImage(
  path: string,
  cwd: string | null,
): Promise<Step<{ bytes: Uint8Array<ArrayBuffer>; type: ImageContentType }>> {
  if (!isAbsolute(path) && cwd === null) {
    return { ok: false, message: "Relative path without a working directory" };
  }
  try {
    // O_NONBLOCK: opening a named pipe must not wait for a writer.
    const handle = await open(
      cwd === null ? path : resolve(cwd, path),
      constants.O_RDONLY | constants.O_NONBLOCK,
    );
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) return { ok: false, message: "Not a regular file" };
      if (stat.size > MAX_ATTACHMENT_BYTES) {
        return {
          ok: false,
          message: `File is larger than ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB`,
        };
      }
      const bytes = new Uint8Array(await handle.readFile());
      const type = imageContentType(bytes);
      if (type === null) return { ok: false, message: "Not a PNG, JPEG, or GIF image" };
      return { ok: true, value: { bytes, type } };
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (errorCode(error) === "ENOENT") return { ok: false, message: "File not found" };
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

async function ghOutput(
  deps: UploadImageDeps,
  args: string[],
  signal: AbortSignal,
): Promise<Step<string>> {
  try {
    return { ok: true, value: (await deps.gh(args, signal)).trim() };
  } catch (error) {
    return { ok: false, message: ghFailureText(classifyGhFailure(ghProcessError(error))) };
  }
}

async function post(
  fetchImpl: typeof fetch,
  url: URL,
  request: RequestInit,
  signal: AbortSignal,
): Promise<Attempt> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...request,
      signal: AbortSignal.any([signal, AbortSignal.timeout(UPLOAD_TIMEOUT_MS)]),
    });
  } catch (error) {
    const message = `Upload failed: ${error instanceof Error ? error.message : String(error)}`;
    return signal.aborted
      ? { kind: "done", result: { ok: false, message } }
      : { kind: "retry", message };
  }
  const body = await response.text();
  if (response.status === 201) {
    const uploaded = uploadedSchema.safeParse(parseJson(body));
    return {
      kind: "done",
      result: uploaded.success
        ? { ok: true, url: uploaded.data.url }
        : { ok: false, message: "GitHub answered the upload without an attachment URL" },
    };
  }
  const message = rejectionMessage(response.status, body);
  return response.status >= 500
    ? { kind: "retry", message }
    : { kind: "done", result: { ok: false, message } };
}

function rejectionMessage(status: number, body: string): string {
  const parsed = githubErrorSchema.safeParse(parseJson(body));
  const details = parsed.success
    ? [parsed.data.message, ...(parsed.data.errors ?? []).map(({ message }) => message)].filter(
        (text) => text !== undefined && text !== "",
      )
    : [];
  return [`GitHub refused the upload (HTTP ${status})`, ...details].join(": ");
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function errorCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
}
