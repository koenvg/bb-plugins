import { backup, DatabaseSync } from "node:sqlite";
import { lstat, mkdir, open, realpath } from "node:fs/promises";
import { basename, dirname, join, resolve, relative, isAbsolute, sep } from "node:path";
import { parseArgs } from "node:util";
import { upgradeRetainedIdentityStorage } from "../dist/host.js";

// Resolve the nearest existing ancestor before creating any backup directories.
async function backupDirectory(path) {
  let ancestor = path;
  const missing = [];
  for (;;) {
    let info;
    try {
      info = await lstat(ancestor);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (info) {
      if (ancestor === path && info.isSymbolicLink())
        throw Error("Backup directory must not be a symbolic link.");
      const actual = await realpath(ancestor);
      if (!(await lstat(actual)).isDirectory()) throw Error("Backup parent is not a directory.");
      return resolve(actual, ...missing);
    }
    const parent = dirname(ancestor);
    if (parent === ancestor) throw Error("Backup directory is unavailable.");
    missing.unshift(basename(ancestor));
    ancestor = parent;
  }
}

const { values } = parseArgs({
  options: {
    "data-dir": { type: "string" },
    apply: { type: "boolean", default: false },
    backup: { type: "string" },
  },
  strict: true,
  allowPositionals: false,
});
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());
try {
  if (!values["data-dir"])
    throw Error("Provide --data-dir. Default operation is read-only inspection.");
  const context = { dataDir: values["data-dir"], signal: controller.signal };
  const plan = await upgradeRetainedIdentityStorage(context);
  if (!values.apply || plan.state !== "ready") {
    console.log(JSON.stringify(plan));
    if (plan.state === "unavailable") process.exitCode = 1;
  } else {
    if (!values.backup) throw Error("Applying requires --backup with a new private backup path.");
    const requested = resolve(values.backup);
    const parent = await backupDirectory(dirname(requested));
    const destination = join(parent, basename(requested));
    const directory = await realpath(join(context.dataDir, "history"));
    const within = relative(directory, destination);
    if (!(within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within)))
      throw Error("Keep the backup outside the live history directory.");
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    if ((await realpath(dirname(destination))) !== parent)
      throw Error("Backup directory changed before creation.");
    const folder = await lstat(dirname(destination));
    if (!folder.isDirectory() || folder.isSymbolicLink() || folder.mode & 0o077)
      throw Error("Backup directory must be private and not a symbolic link.");
    const reserved = await open(destination, "wx", 0o600);
    const original = await reserved.stat();
    try {
      const db = new DatabaseSync(join(directory, "usage-v1.sqlite"), { readOnly: true });
      try {
        await backup(db, destination);
      } finally {
        db.close();
      }
      controller.signal.throwIfAborted();
      const saved = await lstat(destination);
      if (
        !saved.isFile() ||
        saved.isSymbolicLink() ||
        saved.ino !== original.ino ||
        saved.dev !== original.dev ||
        saved.mode & 0o077
      )
        throw Error("Backup file changed or is not private.");
    } finally {
      await reserved.close();
    }
    const result = await upgradeRetainedIdentityStorage({ ...context, apply: true });
    console.log(JSON.stringify(result));
    if (result.state === "unavailable") process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Upgrade failed.");
  process.exitCode = 1;
}
