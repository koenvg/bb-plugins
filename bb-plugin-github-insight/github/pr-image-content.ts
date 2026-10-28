import {
  imageBytes,
  imageError,
  MAX_IMAGE_BYTES,
  type ImageWireResult,
} from "../core/image-content";
import { prImageRefsSchema, type PrImageRefs } from "../core/pr-image-basis";
import type { RepoFile } from "../core/repo-file";
import { readRepoFile } from "./repo-file";

export function imageMergeBaseArgs(value: PrImageRefs): string[] {
  const { baseRepo, headRepo, baseSha, headSha } = prImageRefsSchema.parse(value);
  const comparison = `${baseSha}...${headRepo.owner}:${headSha}`;
  return [
    "api",
    `repos/${baseRepo.owner}/${baseRepo.repo}/compare/${encodeURIComponent(comparison)}`,
  ];
}
const imageFailures = {
  too_large: "Image exceeds the 4 MiB preview limit",
  auth: "GitHub credentials cannot read this image",
  missing: "Image not found at this revision",
  read: "Could not read image from GitHub. Retry or refresh the review.",
} as const;
export async function readPrImage(file: RepoFile, signal: AbortSignal): Promise<ImageWireResult> {
  const read = await readRepoFile(file, MAX_IMAGE_BYTES, signal);
  return read.ok ? imageBytes(read.bytes) : imageError(read.code, imageFailures[read.code]);
}
