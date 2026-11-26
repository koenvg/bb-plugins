import { z } from "zod";

const restFileSchema = z.object({
  filename: z.string(),
  previous_filename: z.string().optional(),
  status: z.string(),
  patch: z.string().optional(),
});

const restFilePageSchema = z.array(restFileSchema);
const restFilePagesSchema = z.array(restFilePageSchema);

export const PR_FILES_PER_PAGE = 100;
// GitHub lists at most 3000 files per pull request.
const MAX_PR_FILE_PAGES = 3000 / PR_FILES_PER_PAGE;

export const reviewFileSchema = z.object({
  path: z.string(),
  previousPath: z.string().nullable(),
  status: z.string(),
  patch: z.string().nullable(),
});
export type ReviewFile = z.infer<typeof reviewFileSchema>;

export function parsePrFiles(pages: unknown): ReviewFile[] {
  return restFilePagesSchema.parse(pages).flatMap((page) =>
    page.map((file) => ({
      path: file.filename,
      previousPath: file.previous_filename ?? null,
      status: file.status,
      patch: file.patch ?? null,
    })),
  );
}

const PARALLEL_PAGE_READS = 6;

async function readPages<T>(numbers: number[], read: (page: number) => Promise<T>): Promise<T[]> {
  const pages: T[] = [];
  for (let start = 0; start < numbers.length; start += PARALLEL_PAGE_READS) {
    pages.push(...(await Promise.all(numbers.slice(start, start + PARALLEL_PAGE_READS).map(read))));
  }
  return pages;
}

export async function collectPrFiles(
  fetchPage: (page: number) => Promise<unknown>,
  fileCount: Promise<number | null> = Promise.resolve(null),
): Promise<ReviewFile[]> {
  const readPage = async (page: number) => restFilePageSchema.parse(await fetchPage(page));
  const pages = [await readPage(1)];
  const isFull = (page: z.infer<typeof restFilePageSchema>) => page.length === PR_FILES_PER_PAGE;
  if (isFull(pages[0]!)) {
    const count = await fileCount.catch(() => null);
    const pageCount = Math.min(Math.ceil((count ?? 0) / PR_FILES_PER_PAGE), MAX_PR_FILE_PAGES);
    const rest = Array.from({ length: Math.max(pageCount - 1, 0) }, (_, index) => index + 2);
    pages.push(...(await readPages(rest, readPage)));
  }
  while (isFull(pages.at(-1)!) && pages.length < MAX_PR_FILE_PAGES) {
    pages.push(await readPage(pages.length + 1));
  }
  return parsePrFiles(pages);
}

export function gitPatch(file: ReviewFile): string | null {
  if (file.patch === null) {
    return null;
  }
  const oldPath = file.previousPath ?? file.path;
  const headers = [`diff --git a/${oldPath} b/${file.path}`];
  if (file.status === "added") {
    headers.push("new file mode 100644");
  }
  if (file.status === "removed") {
    headers.push("deleted file mode 100644");
  }
  if (file.status === "renamed") {
    headers.push(`rename from ${oldPath}`, `rename to ${file.path}`);
  }
  if (file.status === "copied") {
    headers.push(`copy from ${oldPath}`, `copy to ${file.path}`);
  }
  headers.push(
    file.status === "added" ? "--- /dev/null" : `--- a/${oldPath}`,
    file.status === "removed" ? "+++ /dev/null" : `+++ b/${file.path}`,
  );
  return `${headers.join("\n")}\n${file.patch}\n`;
}
