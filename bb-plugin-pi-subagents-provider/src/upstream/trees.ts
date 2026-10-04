import { createHash } from "node:crypto";

type Page = { data: Record<string, any>; next: boolean };
export type ReadPage = (path: string) => Promise<Page>;
interface Entry { path: string; type: "tree" | "blob" | "commit"; mode: string; sha: string }
const modes: Record<string, string> = { "040000": "tree", "100644": "blob", "100755": "blob", "120000": "blob", "160000": "commit" };
function id(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/.test(value)) throw new Error("Incomplete tree metadata");
  return value;
}
function parseEntries(input: unknown): Entry[] {
  if (!Array.isArray(input) || input.length >= 100_000) throw new Error("Incomplete tree coverage");
  const seen = new Set<string>();
  return input.map((entry) => {
    if (!entry || typeof entry.path !== "string" || !entry.path || entry.path.length > 1024 ||
        /[\x00-\x1f\x7f]/.test(entry.path) || entry.path.split("/").some((p: string) => !p || p === "." || p === "..") ||
        seen.has(entry.path) || modes[entry.mode] !== entry.type) throw new Error("Incomplete tree coverage");
    seen.add(entry.path);
    return { path: entry.path, type: entry.type, mode: entry.mode, sha: id(entry.sha) };
  });
}

/** Rebuild every Git tree hash. Even mutually consistent file/tree omissions fail. */
function verifyTreeHashes(root: string, entries: Entry[]) {
  const directories = new Map<string, string>([["", root]]);
  const groups = new Map<string, Entry[]>([["", []]]);
  for (const e of entries) if (e.type === "tree") { directories.set(e.path, e.sha); groups.set(e.path, []); }
  for (const e of entries) {
    const parent = e.path.includes("/") ? e.path.slice(0, e.path.lastIndexOf("/")) : "";
    const group = groups.get(parent);
    if (!group) throw new Error("Incomplete tree coverage");
    group.push(e);
  }
  const name = (e: Entry) => e.path.slice(e.path.lastIndexOf("/") + 1);
  for (const [path, expected] of directories) {
    const sorted = groups.get(path)!.sort((a, b) => Buffer.compare(Buffer.from(name(a) + (a.type === "tree" ? "/" : "")), Buffer.from(name(b) + (b.type === "tree" ? "/" : ""))));
    const content = Buffer.concat(sorted.map((e) => Buffer.concat([
      Buffer.from(`${e.mode === "040000" ? "40000" : e.mode} ${name(e)}\0`), Buffer.from(e.sha, "hex"),
    ])));
    const hash = createHash("sha1").update(`tree ${content.length}\0`).update(content).digest("hex");
    if (hash !== expected) throw new Error("Incomplete tree coverage");
  }
}

/** Trees are immutable and cached only in this run's memory, never inside project source. */
export function treeCoverage(prefix: string, get: ReadPage) {
  const cache = new Map<string, Map<string, string>>();
  async function tree(revision: string) {
    if (cache.has(revision)) return cache.get(revision)!;
    const response = await get(`${prefix}/git/trees/${revision}?recursive=1`);
    const d = response.data;
    if (response.next || d.sha !== revision || d.truncated !== false) throw new Error("Incomplete tree coverage");
    const entries = parseEntries(d.tree);
    verifyTreeHashes(revision, entries);
    const files = new Map(entries.filter((e) => e.type !== "tree").map((e) => [e.path, `${e.mode}:${e.sha}`]));
    cache.set(revision, files);
    return files;
  }
  return async (metadata: Record<string, any>, files: Set<string>) => {
    if (!Array.isArray(metadata.parents) || metadata.parents.length < 1 || metadata.parents.length > 32) throw new Error("Incomplete tree metadata");
    const parentId = id(metadata.parents[0]?.sha);
    const parent = await get(`${prefix}/commits/${parentId}?per_page=100&page=1`);
    if (parent.data.sha !== parentId) throw new Error("Incomplete tree metadata");
    const before = await tree(id(parent.data.commit?.tree?.sha));
    const after = await tree(id(metadata.commit?.tree?.sha));
    const changed = new Set([...before.keys(), ...after.keys()].filter((p) => before.get(p) !== after.get(p)));
    if (changed.size !== files.size || [...changed].some((p) => !files.has(p))) throw new Error("Commit file list disagrees with complete trees");
  };
}
