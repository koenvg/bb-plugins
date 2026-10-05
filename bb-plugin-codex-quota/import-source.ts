import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { basename, dirname, normalize, join } from "node:path";
import type { FileHandle } from "node:fs/promises";
export type RootProof = {
  configured: string;
  resolved: string;
  identity: string;
};
export const identity = (s: { dev: number; ino: number }) => `${s.dev}:${s.ino}`;
export async function proveRoot(configured: string): Promise<RootProof> {
  const resolved = await realpath(configured),
    stat = await lstat(resolved);
  if (!stat.isDirectory() || resolved === "/") throw Error("Import root unavailable");
  return {
    configured: normalize(configured),
    resolved,
    identity: identity(stat),
  };
}
export async function revalidateRoot(root: RootProof) {
  const actual = await proveRoot(root.configured);
  if (actual.resolved !== root.resolved || actual.identity !== root.identity)
    throw Error("Import root changed");
}
export type SourceStamp = { identity: string; size: number; stamp: string };
export const sourceStamp = (s: {
  dev: number;
  ino: number;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
}): SourceStamp => ({
  identity: identity(s),
  size: s.size,
  stamp: `${s.mtimeMs}:${s.ctimeMs}`,
});
export function sameStamp(a: SourceStamp, b: SourceStamp) {
  return a.identity === b.identity && a.size === b.size && a.stamp === b.stamp;
}
/** No bytes until both owning-root proof and opened-file/path identities agree. Flat configured roots only. */
export async function confinedFile(
  root: RootProof,
  name: string,
  saved?: SourceStamp,
): Promise<{ file: FileHandle; stamp: SourceStamp }> {
  if (
    basename(name) !== name ||
    !name.endsWith(".jsonl") ||
    name === ".jsonl" ||
    name.includes("\\")
  )
    throw Error("Import filename unavailable");
  await revalidateRoot(root);
  const path = join(root.resolved, name),
    canonical = await realpath(path);
  if (canonical !== path || dirname(canonical) !== root.resolved)
    throw Error("Import confinement unavailable");
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink()) throw Error("Import source unavailable");
  // Nonblocking open also rejects replacement-to-pipe races without stranding the host queue.
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat(),
      pathStat = await lstat(path),
      stamp = sourceStamp(stat);
    if (
      !stat.isFile() ||
      !pathStat.isFile() ||
      !sameStamp(sourceStamp(before), stamp) ||
      pathStat.isSymbolicLink() ||
      identity(stat) !== identity(pathStat) ||
      (saved && !sameStamp(stamp, saved))
    )
      throw Error("Import source changed");
    return { file, stamp };
  } catch (e) {
    await file.close();
    throw e;
  }
}
export async function revalidateFile(
  file: FileHandle,
  root: RootProof,
  name: string,
  stamp: SourceStamp,
) {
  await revalidateRoot(root);
  const path = join(root.resolved, name),
    s = await lstat(path);
  if (
    s.isSymbolicLink() ||
    (await realpath(path)) !== path ||
    !sameStamp(sourceStamp(s), stamp) ||
    !sameStamp(sourceStamp(await file.stat()), stamp)
  )
    throw Error("Import source changed");
}
