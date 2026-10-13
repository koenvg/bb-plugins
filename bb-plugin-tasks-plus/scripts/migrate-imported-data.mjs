import Database from "better-sqlite3";
import { initializeTasksSchema } from "../db/schema.ts";

const path = process.argv[2];
if (!path) throw new Error("Supply the disposable imported database path");
const db = new Database(path);
try {
  initializeTasksSchema(db);
  if (db.pragma("foreign_key_check").length) throw new Error("Imported foreign-key check failed");
  if (db.pragma("integrity_check")[0]?.integrity_check !== "ok") {
    throw new Error("Imported integrity check failed");
  }
} finally {
  db.close();
}
