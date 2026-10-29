import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { expect, it } from "vitest";

const script = fileURLToPath(new URL("./import-bundled-data.sh", import.meta.url));
const legacySchema = readFileSync(
  new URL("../test-fixtures/pre-comment-removal.sql", import.meta.url),
  "utf8",
);

it.skipIf(spawnSync("sqlite3", ["--version"]).status !== 0)(
  "migrates copied legacy tasks and files before reads, preserves the source and refuses a populated target",
  () => {
    const root = mkdtempSync(join(tmpdir(), "tasks-plus-import-"));
    const from = join(root, "tasks");
    const to = join(root, "tasks-plus");
    const id = "01HZZZZZZZZZZZZZZZZZZZZZA1";
    const oldUrl = `/api/v1/plugins/tasks/http/attachments/download?attachmentId=${id}`;
    const newUrl = oldUrl.replace("/tasks/", "/tasks-plus/");
    try {
      mkdirSync(from);
      const db = new Database(join(from, "data.db"));
      db.exec(legacySchema);
      db.exec(`INSERT INTO projects (id, name, prefix, color, created_at)
        VALUES ('project', 'Legacy', 'LEG', 'blue', 'created')`);
      for (let number = 1; number <= 18; number++) {
        db.prepare(`INSERT INTO tasks (id, project_id, number, title, description,
          status, priority, position, created_at, updated_at)
          VALUES (?, 'project', ?, 'Retained task', ?, 'todo', 'none', ?, 'created', 'updated')`).run(
          `task-${number}`,
          number,
          `![image](${oldUrl})`,
          number,
        );
      }
      db.prepare(`INSERT INTO comments (id, task_id, kind, author_name, body, created_at)
        VALUES ('comment', 'task-1', 'user', 'Operator', ?, 'created')`).run(`See ${oldUrl}`);
      db.prepare(
        "INSERT INTO attachments VALUES (?, NULL, 'comment', 'legacy.txt', 'text/plain', 6, 'blobs/legacy.txt', 0, 'created')",
      ).run(id);
      db.close();
      mkdirSync(join(from, "blobs"));
      writeFileSync(join(from, "blobs/legacy.txt"), "legacy");
      const bin = join(root, "bin");
      mkdirSync(bin);
      writeFileSync(join(bin, "bb"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
      const options = { env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` } };
      execFileSync("bash", [script, "--from", from, "--to", to], options);
      const imported = new Database(join(to, "data.db"), { readonly: true });
      try {
        expect(imported.prepare("SELECT COUNT(*) AS count FROM tasks").get()).toEqual({
          count: 18,
        });
        expect(
          imported.prepare("SELECT description FROM tasks WHERE id = 'task-1'").pluck().get(),
        ).toBe(`![image](${newUrl})`);
        expect(
          imported.prepare("SELECT name FROM sqlite_master WHERE name = 'comments'").all(),
        ).toEqual([]);
        expect(imported.prepare("SELECT * FROM attachments").get()).toMatchObject({
          id,
          task_id: "task-1",
          file_name: "legacy.txt",
          mime: "text/plain",
          size_bytes: 6,
          blob_path: "blobs/legacy.txt",
          created_at: "created",
        });
        expect(
          imported.prepare("SELECT MAX(version) AS version FROM schema_version").get(),
        ).toEqual({ version: 14 });
        expect(imported.pragma("foreign_key_check")).toEqual([]);
        expect(imported.pragma("integrity_check")).toEqual([{ integrity_check: "ok" }]);
      } finally {
        imported.close();
      }
      expect(readFileSync(join(to, "blobs/legacy.txt"), "utf8")).toBe("legacy");
      const original = new Database(join(from, "data.db"), { readonly: true });
      try {
        expect(
          original.prepare("SELECT description FROM tasks WHERE id = 'task-1'").pluck().get(),
        ).toBe(`![image](${oldUrl})`);
        expect(original.prepare("SELECT body FROM comments").pluck().get()).toBe(`See ${oldUrl}`);
        expect(original.prepare("SELECT task_id, comment_id FROM attachments").get()).toEqual({
          task_id: null,
          comment_id: "comment",
        });
      } finally {
        original.close();
      }
      const targetBefore = readFileSync(join(to, "data.db"));
      expect(() =>
        execFileSync("bash", [script, "--from", from, "--to", to], { ...options, stdio: "pipe" }),
      ).toThrow();
      expect(readFileSync(join(to, "data.db"))).toEqual(targetBefore);
      expect(readFileSync(join(to, "blobs/legacy.txt"), "utf8")).toBe("legacy");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
