import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { expect, it } from "vitest";

const script = fileURLToPath(new URL("./import-bundled-data.sh", import.meta.url));

it.skipIf(spawnSync("sqlite3", ["--version"]).status !== 0)(
  "updates bundled attachment links in the copied data without changing the source",
  () => {
    const root = mkdtempSync(join(tmpdir(), "tasks-plus-import-"));
    const from = join(root, "tasks");
    const to = join(root, "tasks-plus");
    const legacyUrl = "/api/v1/plugins/tasks/http/attachments/download?attachmentId=att-1";
    const newUrl = "/api/v1/plugins/tasks-plus/http/attachments/download?attachmentId=att-1";

    try {
      mkdirSync(from);
      const db = new Database(join(from, "data.db"));
      db.exec(`
        CREATE TABLE tasks (description TEXT NOT NULL);
        CREATE TABLE comments (body TEXT NOT NULL);
        CREATE TABLE presets (id TEXT);
        CREATE TABLE task_threads (id TEXT);
        CREATE TABLE attachments (id TEXT);
      `);
      db.prepare("INSERT INTO tasks (description) VALUES (?)").run(`![image](${legacyUrl})`);
      db.prepare("INSERT INTO comments (body) VALUES (?)").run(
        `See ${legacyUrl} and https://example.com/tasks`,
      );
      db.close();

      const bin = join(root, "bin");
      mkdirSync(bin);
      writeFileSync(join(bin, "bb"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
      execFileSync("bash", [script, "--from", from, "--to", to], {
        env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` },
      });

      const imported = new Database(join(to, "data.db"), { readonly: true });
      expect(imported.prepare("SELECT description FROM tasks").pluck().get()).toBe(
        `![image](${newUrl})`,
      );
      expect(imported.prepare("SELECT body FROM comments").pluck().get()).toBe(
        `See ${newUrl} and https://example.com/tasks`,
      );
      imported.close();

      const original = new Database(join(from, "data.db"), { readonly: true });
      expect(original.prepare("SELECT description FROM tasks").pluck().get()).toBe(
        `![image](${legacyUrl})`,
      );
      original.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
