import { mkdtempSync, mkdirSync, cpSync, symlinkSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const source = process.cwd();
const directory = mkdtempSync(join(tmpdir(), "bbp53-clean-"));
const checkout = join(directory, "checkout");
const bin = join(directory, "bin");
mkdirSync(bin);
symlinkSync(process.execPath, join(bin, "node"));
for (const name of ["bun", "git", "sqlite3"]) {
  const found = spawnSync("which", [name], { encoding: "utf8" });
  if (found.status === 0) symlinkSync(found.stdout.trim(), join(bin, name));
}
process.env.PATH = `${bin}:/usr/bin:/bin`;
process.env.BB_DATA_DIR = join(directory, "build-data");
process.env.BBP53_CAPTURE_PHASE = "none";
const ambient = spawnSync("bb", ["--version"]);
if (ambient.error?.code !== "ENOENT") throw new Error("Ambient BB remains available");
console.log("PASS minimal PATH has no desktop/global BB; isolated temporary BB_DATA_DIR");
function run(command, args, cwd = checkout) {
  console.log(`$ ${command} ${args.join(" ")} [${cwd}]`);
  const result = spawnSync(command, args, { cwd, stdio: "inherit", env: process.env });
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
}
run("git", ["clone", "--no-hardlinks", "--quiet", source, checkout], source);
const patch = execFileSync("git", ["diff", "--binary", "HEAD"], { cwd: source });
const apply = spawnSync("git", ["apply", "--binary"], { cwd: checkout, input: patch });
if (apply.status !== 0) throw new Error(String(apply.stderr));
const newFiles = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
  cwd: source,
})
  .toString()
  .split("\0")
  .filter(Boolean);
for (const file of newFiles) {
  if (file.startsWith("verification/BBP-53/") && /\.(log|png|json)$/.test(file)) continue;
  const destination = join(checkout, file);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(join(source, file), destination);
}
console.log(`Fresh checkout ${checkout}`);
run("bun", ["install", "--frozen-lockfile"]);
const shared = join(checkout, "packages/markdown-document");
for (const args of [
  ["install", "--frozen-lockfile"],
  ["run", "build"],
  ["run", "test"],
  ["run", "typecheck"],
])
  run("bun", args, shared);
run("bun", ["install", "--frozen-lockfile"], join(checkout, "bb-plugin-codex-quota"));
const tasks = join(checkout, "bb-plugin-tasks-plus");
for (const args of [
  ["install", "--frozen-lockfile"],
  ["run", "typecheck"],
  [
    "run",
    "test",
    "attachments/preview.test.ts",
    "attachments/attachments.test.ts",
    "views/detail/attachment-preview.test.tsx",
    "views/detail/keyboard.test.tsx",
  ],
  ["run", "build"],
])
  run("bun", args, tasks);
const bb = join(tasks, "node_modules/.bin/bb");
const version = execFileSync(bb, ["--version"], { cwd: tasks, encoding: "utf8" }).trim();
if (version !== "0.46.0") throw new Error(`Wrong official BB version ${version}`);
console.log("PASS locked local bb-app 0.46.0 bootstrap, without ambient BB");
run(bb, ["plugin", "types", ".", "--check"], tasks);
for (const artifact of ["app", "server"]) {
  const meta = JSON.parse(readFileSync(join(tasks, `dist/${artifact}.meta.json`), "utf8"));
  if (meta.sdkVersion !== "0.6.37" || meta.builtWith.bbVersion !== "0.46.0")
    throw new Error(`Unexpected ${artifact} build metadata`);
}
console.log("PASS official app/server build metadata BB 0.46.0 / SDK 0.6.37");
const app = readFileSync(join(tasks, "dist/app.js"), "utf8");
const css = readFileSync(join(tasks, "dist/app.css"), "utf8");
if (!app.includes("md-document-prose") || !app.includes("contains-task-list"))
  throw new Error("Shared document code is missing from the Tasks bundle");
if (!css.includes(".md-document") || !css.includes(".attachment-preview"))
  throw new Error("Shared or dialog CSS is missing from the Tasks bundle");
if (/from\s*["'](?:@bb-plugins\/markdown-document|\.\.\/packages\/markdown-document)/.test(app))
  throw new Error("Runtime sibling dependency remains");
if (app.includes("__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE"))
  throw new Error("A React runtime was bundled");
const compiled = readFileSync(join(shared, "dist/index.js"), "utf8");
if (!compiled.includes('from "react/jsx-runtime"'))
  throw new Error("Compiled package does not use consumer React");
console.log(
  "PASS consumer-owned React peer; compiled JSX runtime import and no bundled React runtime marker",
);
console.log("PASS independently bundled Markdown code and CSS");
run("bun", ["run", "test:browser"], tasks);
const previewPath = join(tasks, "views/detail/attachment-preview.tsx");
const finalPreview = readFileSync(previewPath, "utf8");
const reviewedSelector = `const another = [...document.querySelectorAll<HTMLElement>(
  '[role="dialog"], [role="alertdialog"], [role="menu"]',
)].some((element) => !element.contains(panel.current) && !panel.current?.contains(element) &&
  element.getAttribute("data-state") !== "closed" && usable(element));
if (another) return;`;
writeFileSync(
  previewPath,
  finalPreview.replace("if (hasOpenOverlay(panel.current)) return;", reviewedSelector),
);
const listboxBeforeFix = spawnSync(
  "bun",
  ["run", "test", "views/detail/attachment-preview.test.tsx", "-t", "newer listbox"],
  {
    cwd: tasks,
    stdio: "inherit",
  },
);
writeFileSync(previewPath, finalPreview);
if (listboxBeforeFix.status === 0 || listboxBeforeFix.status === null)
  throw new Error("Reviewed selector did not reproduce listbox focus contention");
console.log("PASS reviewed selector reproduces listbox focus contention; final owner restored");
const shortcutsPath = join(tasks, "shell/shortcuts.ts");
const finalShortcuts = readFileSync(shortcutsPath, "utf8");
const baselineShortcuts = execFileSync(
  "git",
  ["show", "939bd318cedb00239b73e1fd1c3d5d90c79ada70:bb-plugin-tasks-plus/shell/shortcuts.ts"],
  { cwd: source, encoding: "utf8" },
);
writeFileSync(shortcutsPath, baselineShortcuts);
const beforeFix = spawnSync(
  "bun",
  ["run", "test", "views/detail/keyboard.test.tsx", "-t", "preserves editor"],
  { cwd: tasks, stdio: "inherit" },
);
writeFileSync(shortcutsPath, finalShortcuts);
if (beforeFix.status === 0 || beforeFix.status === null)
  throw new Error("Original shortcut safeguard did not reproduce the compact recovery failure");
console.log(
  "PASS original safeguard reproduces full-Tasks compact shortcut recovery failure; final safeguard restored",
);
const failureTest = join(shared, "test/ci-failure.test.ts");
writeFileSync(
  failureTest,
  'import { it, expect } from "vitest"; it("CI failure sentinel", () => expect(1).toBe(2));\n',
);
const failed = spawnSync(
  "bash",
  [
    "-c",
    "set -e; bun install --frozen-lockfile; bun run build; bun run test; bun run typecheck; touch ci-consumer-allowed",
  ],
  { cwd: shared, stdio: "inherit" },
);
if (failed.status === 0) throw new Error("Shared test failure did not fail bootstrap");
let markerExists = false;
try {
  readFileSync(join(shared, "ci-consumer-allowed"));
  markerExists = true;
} catch {}
if (markerExists) throw new Error("Failed shared tests allowed consumer bootstrap");
console.log(
  "PASS shared-test failure blocks subsequent consumer setup; workflow uses these same fail-fast steps without continue-on-error",
);
console.log(
  "Fresh checkout retained for parent inspection. No source or installed-data cleanup ran.",
);
