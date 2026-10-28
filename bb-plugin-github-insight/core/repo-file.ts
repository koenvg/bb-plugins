import { z } from "zod";
import { imagePathSchema, imageShaSchema } from "./image-content";
import { imageRepoSchema } from "./pr-image-basis";

export const repoFileSchema = imageRepoSchema
  .extend({ sha: imageShaSchema, path: imagePathSchema })
  .strict();
export type RepoFile = z.infer<typeof repoFileSchema>;

const RAW_FILE_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/([a-f0-9]{40})\/([^?#]+)$/i;

function decodedPath(encoded: string): string | null {
  try {
    const segments = encoded.split("/").map(decodeURIComponent);
    return segments.some((segment) => segment.includes("/")) ? null : segments.join("/");
  } catch {
    return null;
  }
}

export function repoFileFromRawUrl(url: string): RepoFile | null {
  const [, owner, repo, sha, encodedPath = ""] = RAW_FILE_URL.exec(url) ?? [];
  const parsed = repoFileSchema.safeParse({
    owner,
    repo,
    sha,
    path: decodedPath(encodedPath),
  });
  return parsed.success ? parsed.data : null;
}
