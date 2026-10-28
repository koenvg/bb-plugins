import type { z } from "zod";
import { prImageRequestSchema } from "./pr-image-basis";

export type RepoImageRef = z.infer<typeof prImageRequestSchema>;

const RAW_FILE_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/([a-f0-9]{40})\/([^?#]+)$/i;

function decodedPath(encoded: string): string | null {
  try {
    const segments = encoded.split("/").map(decodeURIComponent);
    return segments.some((segment) => segment.includes("/")) ? null : segments.join("/");
  } catch {
    return null;
  }
}

export function repoImageRef(url: string): RepoImageRef | null {
  const [, owner, repo, sha, encodedPath = ""] = RAW_FILE_URL.exec(url) ?? [];
  const parsed = prImageRequestSchema.safeParse({
    owner,
    repo,
    sha,
    path: decodedPath(encodedPath),
  });
  return parsed.success ? parsed.data : null;
}
