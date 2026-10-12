import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import type { FileHandle } from "node:fs/promises";

const identity = (s: { dev: number; ino: number }) => `${s.dev}:${s.ino}`;
export const stamp = (s: { mtimeMs: number; ctimeMs: number }) => `${s.mtimeMs}:${s.ctimeMs}`;
/** Prove every ancestor, not only the last directory. No header path becomes a read destination. */
export async function proveDirectory(path: string): Promise<string> {
  if (!isAbsolute(path) || resolve(path) !== path || path === sep)
    throw Error("Native source unavailable");
  const proofs = [];
  for (let parent = path; parent !== dirname(parent); parent = dirname(parent)) {
    const stat = await lstat(parent);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error("Native source unavailable");
    proofs.push(`${parent}:${identity(stat)}`);
  }
  return proofs.join("\n");
}
export async function openSource(path: string): Promise<{
  file: FileHandle;
  identity: string;
  size: number;
  stamp: string;
  verify(): Promise<void>;
}> {
  const parent = dirname(path),
    proof = await proveDirectory(parent),
    before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink()) throw Error("Native source unavailable");
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  const verify = async () => {
    const current = await file.stat(),
      named = await lstat(path);
    if (
      !current.isFile() ||
      !named.isFile() ||
      named.isSymbolicLink() ||
      identity(current) !== identity(before) ||
      identity(named) !== identity(before) ||
      current.size !== before.size ||
      stamp(current) !== stamp(before) ||
      stamp(named) !== stamp(before) ||
      (await proveDirectory(parent)) !== proof
    )
      throw Error("Native source changed");
  };
  try {
    await verify();
    return { file, identity: identity(before), size: before.size, stamp: stamp(before), verify };
  } catch (error) {
    await file.close();
    throw error;
  }
}
export const missing = (error: unknown) =>
  !!error && typeof error === "object" && "code" in error && error.code === "ENOENT";
