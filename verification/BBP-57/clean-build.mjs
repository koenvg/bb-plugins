import {
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
} from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../../", import.meta.url));
const evidence = resolve(process.argv[2] ?? "");
if (!process.argv[2])
  throw new Error("Usage: node verification/BBP-57/clean-build.mjs NEW_EVIDENCE_DIRECTORY");
mkdirSync(evidence, { mode: 0o700 });
const bin = join(evidence, "bin");
mkdirSync(bin);
symlinkSync(process.execPath, join(bin, "node"));
for (const name of ["bun", "git", "sqlite3"]) {
  const path = execFileSync("which", [name], { encoding: "utf8" }).trim();
  symlinkSync(path, join(bin, name));
}
const environment = { ...process.env, PATH: `${bin}:/usr/bin:/bin`, NODE_PATH: "" };
if (spawnSync("bb", ["--version"], { env: environment }).error?.code !== "ENOENT")
  throw new Error("Ambient BB must be absent");
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: source },
)
  .toString()
  .split("\0")
  .filter(Boolean);
const checks = [];
const inputs = [];
function run(name, command, args, cwd, env) {
  const log = join(evidence, `${name}.log`);
  const fd = openSync(log, "wx");
  let result;
  try {
    result = spawnSync(command, args, { cwd, env, stdio: ["ignore", fd, fd] });
  } finally {
    closeSync(fd);
  }
  checks.push({ name, command, args, exit: result.status, error: result.error?.message, log });
  writeFileSync(join(evidence, "checks.json"), JSON.stringify(checks, null, 2));
  if (result.status !== 0) throw new Error(`${name} failed; inspect ${log}`);
  console.log(`PASS ${name}`);
}
for (const leaf of ["bb-plugin-markdown-reader", "bb-plugin-tasks-plus"]) {
  const checkout = join(evidence, leaf);
  mkdirSync(checkout);
  const prefixes = [`${leaf}/`, "packages/markdown-document/", "scripts/"];
  if (leaf === "bb-plugin-tasks-plus") prefixes.push("bb-plugin-codex-quota/");
  for (const file of files) {
    if (!prefixes.some((prefix) => file.startsWith(prefix)) || !existsSync(join(source, file)))
      continue;
    const target = join(checkout, file);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(source, file), target);
    inputs.push({
      leaf,
      file,
      sha256: createHash("sha256").update(readFileSync(target)).digest("hex"),
    });
  }
  writeFileSync(join(evidence, "inputs.json"), JSON.stringify(inputs, null, 2));
  const opposite =
    leaf === "bb-plugin-markdown-reader" ? "bb-plugin-tasks-plus" : "bb-plugin-markdown-reader";
  if (existsSync(join(checkout, opposite)))
    throw new Error("Opposite plugin source must be absent");
  const env = { ...environment, BB_DATA_DIR: join(evidence, `${leaf}-build-data`) };
  const shared = join(checkout, "packages/markdown-document");
  for (const [label, args] of [
    ["install", ["install", "--frozen-lockfile"]],
    ["build", ["run", "build"]],
    ["test", ["run", "test", "--maxWorkers=1"]],
    ["types", ["run", "typecheck"]],
  ])
    run(`${leaf}-shared-${label}`, "bun", args, shared, env);
  run(
    `${leaf}-compiled-esm`,
    "node",
    [
      "--input-type=module",
      "-e",
      `import {createDocumentModel, MarkdownDocument} from './dist/index.js'; import {createElement} from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import assert from 'node:assert/strict'; const model=createDocumentModel('# Shared report\\n', 'compiled'); assert.match(renderToStaticMarkup(createElement(MarkdownDocument,{model,view:'preview'})), /Shared report/); assert.equal(model.headings[0].line,1);`,
    ],
    shared,
    env,
  );
  if (leaf === "bb-plugin-tasks-plus")
    run(
      `${leaf}-quota-fixture-install`,
      "bun",
      ["install", "--frozen-lockfile"],
      join(checkout, "bb-plugin-codex-quota"),
      env,
    );
  const consumer = join(checkout, leaf);
  run(`${leaf}-install`, "bun", ["install", "--frozen-lockfile"], consumer, env);
  run(`${leaf}-types`, "bun", ["run", "typecheck"], consumer, env);
  const bb = join(consumer, "node_modules/.bin/bb");
  if (execFileSync(bb, ["--version"], { cwd: consumer, env, encoding: "utf8" }).trim() !== "0.46.0")
    throw new Error("Unexpected local build CLI");
  run(`${leaf}-sdk`, bb, ["plugin", "types", ".", "--check"], consumer, env);
  run(`${leaf}-build`, "bun", ["run", "build"], consumer, env);
  const app = readFileSync(join(consumer, "dist/app.js"), "utf8");
  const css = readFileSync(join(consumer, "dist/app.css"), "utf8");
  if (!app.includes("md-document") || !app.includes("mr-prose") || !css.includes(".md-document"))
    throw new Error("Shared code/CSS absent");
  if (
    /\b(?:from|import)\s*["'](?:@bb-plugins\/markdown-document|\.\.\/packages\/markdown-document)/.test(
      app,
    )
  )
    throw new Error("Runtime shared-package import remains");
  if (
    app.includes("__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE") ||
    /react\.(?:production|development)/.test(app)
  )
    throw new Error("Second React runtime bundled");
  const artifacts = ["app.js", "app.css", "server.js"].map((file) => ({
    file,
    sha256: createHash("sha256")
      .update(readFileSync(join(consumer, "dist", file)))
      .digest("hex"),
  }));
  writeFileSync(
    join(evidence, `${leaf}-artifacts.json`),
    JSON.stringify({ oppositeSourceAbsent: true, artifacts }, null, 2),
  );
  console.log(
    `PASS ${leaf} bundles shared presentation without ${opposite} source or installed state`,
  );
}
console.log(`Clean checkouts, isolated build data and logs retained at ${evidence}`);
