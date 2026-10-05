import { mkdir, writeFile, readFile, readdir, lstat, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

const digest = (data) => createHash("sha256").update(data).digest("hex");
const serialize = (fixture) => JSON.stringify(fixture, null, 2) + "\n";
// One digest for the canonical fixture file bytes and the browser-run identity.
export const fixtureDigest = (fixture) => digest(serialize(fixture));
export function createFixture(owner) {
  if (!/^bbp60-[a-z0-9-]{3,48}$/.test(owner)) throw new Error("Use an owned bbp60- name.");
  const labels = ["Documentation", "Backend", "Review"].map((name, i) => ({
    id: `${owner}-label-${i}`,
    name,
    color: ["blue", "green", "gray"][i],
  }));
  const tasks = Array.from({ length: 100 }, (_, i) => {
    const key = `BENCH-${i + 1}`;
    const marker = `${owner} description ${key}`;
    const intro = `## ${marker}\n\nCheck the native Ticket pane for ${key}.\n\n- Keep the selected row and description together.\n- Keep comment drafts on their original task.\n\n[Reference](https://example.com/benchmark)\n\n`;
    const paragraph =
      "The reviewer checks the current description, dates and labels before moving to the next task. Save failures must keep the original task and its draft available.\n\n";
    const description =
      intro +
      paragraph.repeat(Math.ceil((2048 - Buffer.byteLength(intro)) / Buffer.byteLength(paragraph)));
    return {
      id: `${owner}-task-${i + 1}`,
      key,
      owner,
      title: `${owner} task ${i + 1}`,
      status:
        i < 10 || i === 99
          ? "todo"
          : ["backlog", "todo", "in_progress", "in_review", "done"][i % 5],
      priority: ["none", "low", "medium", "high"][i % 4],
      dueDate: `2026-${String(10 + (i % 3)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`,
      labelIds: [labels[i % 3].id],
      description,
      marker,
    };
  });
  const activity = {
    taskKey: tasks[99].key,
    comments: Array.from({ length: 50 }, (_, i) => ({
      id: `${owner}-comment-${i + 1}`,
      authorKind: i % 2 ? "agent" : "human",
      body: `### Review ${i + 1}\n\n${owner} checked attachment ownership and task identity.`,
      createdAt: `2026-10-01T10:${String(i).padStart(2, "0")}:00.000Z`,
      attachments:
        i % 5 === 0
          ? [
              {
                id: `${owner}-attachment-${i}`,
                name: `review-${i}.txt`,
                mimeType: "text/plain",
                content: `${owner} review ${i}\n`,
              },
            ]
          : [],
    })),
  };
  const warmKeys = tasks.slice(0, 10).map((t) => t.key);
  // Ten visits in each direction, repeated twice: 36 movements with A-B-A returns.
  const movements = [...warmKeys.slice(1), ...warmKeys.slice(0, -1).reverse()];
  return {
    schemaVersion: 1,
    owner,
    project: { name: owner, prefix: "BENCH" },
    labels,
    tasks,
    warmKeys,
    movements: [...movements, ...movements],
    activity,
  };
}
export async function writeFixture(dir, owner) {
  const fixture = serialize(createFixture(owner));
  await mkdir(dir); // Refuse existing paths. Never replace or merge a user's directory.
  await writeFile(join(dir, "fixture.json"), fixture, { flag: "wx" });
  await writeFile(
    join(dir, "ownership.json"),
    JSON.stringify({ owner, sha256: digest(fixture) }) + "\n",
    { flag: "wx" },
  );
}
export async function cleanupFixture(dir, owner) {
  if (!(await lstat(dir)).isDirectory() || (await lstat(dir)).isSymbolicLink())
    throw new Error("Not an owned directory.");
  const names = (await readdir(dir)).sort();
  if (names.join(",") !== "fixture.json,ownership.json")
    throw new Error("Unexpected files; cleanup refused.");
  for (const name of names)
    if (!(await lstat(join(dir, name))).isFile()) throw new Error("Not an owned regular file.");
  const identity = JSON.parse(await readFile(join(dir, "ownership.json"), "utf8"));
  const bytes = await readFile(join(dir, "fixture.json"));
  if (
    identity.owner !== owner ||
    JSON.parse(bytes).owner !== owner ||
    identity.sha256 !== digest(bytes)
  )
    throw new Error("Owner or digest changed; cleanup refused.");
  for (const name of names) await unlink(join(dir, name));
  await rmdir(dir);
}
