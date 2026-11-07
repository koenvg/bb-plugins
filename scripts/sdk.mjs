import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  globSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";

const root = realpathSync(dirname(dirname(fileURLToPath(import.meta.url))));
const sdk = "@get-bb/plugin-sdk";
const runtime = "@get-bb/plugin-sdk-runtime";
const usage = `Use Bun to run scripts/sdk.mjs:
  audit [--package DIRECTORY] [--all-worktrees]
  align --package DIRECTORY [--package DIRECTORY ...]
  align --owned-checkout PATH --package DIRECTORY --apply --evidence NEW_DIRECTORY
Alignment previews by default. Apply requires separate dependency-write approval.
Preview may query npm publication metadata. Neither command activates plugins.`;

function request(args) {
  const mode = args.shift();
  if (!["audit", "align"].includes(mode)) throw new Error(usage);
  const values = { packages: [] };
  while (args.length) {
    const flag = args.shift();
    if (["--apply", "--all-worktrees"].includes(flag) && values[flag] === undefined) {
      values[flag] = true;
      continue;
    }
    if (!["--package", "--owned-checkout", "--evidence"].includes(flag)) {
      throw new Error(`Unknown or duplicate argument: ${flag}`);
    }
    const value = args.shift();
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    if (flag === "--package") {
      if (values.packages.includes(value)) throw new Error(`Duplicate package: ${value}`);
      values.packages.push(value);
    } else {
      if (values[flag] !== undefined) throw new Error(`Duplicate argument: ${flag}`);
      values[flag] = value;
    }
  }
  if (mode === "audit") {
    if (values["--apply"] || values["--owned-checkout"] || values["--evidence"]) {
      throw new Error("Audit is report-only");
    }
    return { kind: "audit", allWorktrees: !!values["--all-worktrees"], packages: values.packages };
  }
  if (values["--all-worktrees"]) throw new Error("Alignment cannot target other worktrees");
  if (!values.packages.length) throw new Error("Alignment requires explicit --package selections");
  if (!values["--apply"]) {
    if (values["--evidence"]) throw new Error("Evidence is an apply-only option");
    if (values["--owned-checkout"]) throw new Error("Ownership is an apply-only option");
    return { kind: "preview", packages: values.packages };
  }
  if (!values["--owned-checkout"] || !values["--evidence"]) {
    throw new Error("Apply requires --owned-checkout and --evidence");
  }
  return {
    kind: "apply",
    packages: values.packages,
    ownedCheckout: values["--owned-checkout"],
    evidence: values["--evidence"],
  };
}

function run(command, cwd = root, env = process.env) {
  const child = spawnSync(command[0], command.slice(1), {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    command,
    cwd,
    exitCode: child.status ?? null,
    signal: child.signal ?? null,
    error: child.error?.message ?? null,
    stdout: child.stdout ?? "",
    stderr: child.stderr ?? "",
  };
}

function passed(result) {
  return result.exitCode === 0 && result.signal === null && result.error === null;
}

function git(path, ...args) {
  return execFileSync("git", args, { cwd: path, encoding: "utf8" });
}

function manifest(path) {
  if (!lstatSync(path).isFile()) throw new Error(`Manifest must be a regular file: ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function discover(path, selections, purpose) {
  const workspace = manifest(join(path, "package.json"));
  let patterns = workspace.workspaces;
  if (!Object.hasOwn(workspace, "workspaces")) {
    if (purpose !== "audit") throw new Error(`Missing workspaces in ${path}`);
    patterns = ["bb-plugin-*"];
  }
  if (
    !Array.isArray(patterns) ||
    patterns.some((pattern) => typeof pattern !== "string" || !pattern.trim())
  ) {
    throw new Error(`Invalid workspaces in ${path}`);
  }
  const packages = globSync(
    patterns.map((pattern) => `${pattern}/package.json`),
    {
      cwd: path,
    },
  )
    .sort()
    .flatMap((file) => {
      const directory = dirname(file);
      const absolute = join(path, directory);
      const canonical = realpathSync(absolute);
      if (canonical !== absolute || !canonical.startsWith(path + sep)) {
        throw new Error(`Workspace escapes checkout or uses a symlink: ${directory}`);
      }
      const pkg = manifest(join(absolute, "package.json"));
      return pkg.bb ? [{ directory, path: absolute, manifest: pkg }] : [];
    });
  for (const selected of selections) {
    if (!packages.some(({ directory }) => selected === directory)) {
      throw new Error(`Unknown or escaping package: ${selected}`);
    }
  }
  return selections.length
    ? selections.map((name) => packages.find(({ directory }) => directory === name))
    : packages;
}

function declarations(pkg) {
  return {
    sdk: pkg.devDependencies?.[sdk] ?? pkg.dependencies?.[sdk] ?? null,
    runtimeAlias: pkg.dependencies?.[runtime] ?? pkg.devDependencies?.[runtime] ?? null,
    engines: pkg.engines ?? {},
  };
}

function observe(path, packages) {
  const status = git(path, "status", "--porcelain=v1", "--untracked-files=all");
  return {
    path,
    head: git(path, "rev-parse", "HEAD").trim(),
    dirty: status.length > 0,
    status,
    packages: packages.map((pkg) => {
      const committed = run(["git", "show", `HEAD:${pkg.directory}/package.json`], path);
      const official = run(["bb", "plugin", "types", pkg.path, "--check"], path);
      return {
        directory: pkg.directory,
        name: pkg.manifest.name,
        declarations: declarations(pkg.manifest),
        committed: passed(committed) ? declarations(JSON.parse(committed.stdout)) : null,
        committedError: passed(committed) ? null : committed.stderr,
        official,
        status: passed(official) ? "current" : "needs-attention",
      };
    }),
  };
}

function worktrees() {
  return git(root, "worktree", "list", "--porcelain", "-z")
    .split("\0")
    .filter((field) => field.startsWith("worktree "))
    .map((field) => field.slice(9));
}

function outsideCheckouts(path) {
  if (worktrees().some((checkout) => path === checkout || path.startsWith(checkout + sep))) {
    throw new Error(`Path must be outside all checkouts: ${path}`);
  }
}

function applyAuthority(input) {
  if (
    realpathSync(input.ownedCheckout) !== root ||
    realpathSync(git(process.cwd(), "rev-parse", "--show-toplevel").trim()) !== root
  ) {
    throw new Error("Apply requires the explicitly owned current checkout");
  }
  if (git(root, "status", "--porcelain=v1", "--untracked-files=all")) {
    throw new Error("Apply requires a clean tracked and untracked checkout");
  }
  for (const marker of [
    "MERGE_HEAD",
    "CHERRY_PICK_HEAD",
    "REVERT_HEAD",
    "rebase-merge",
    "rebase-apply",
    "sequencer",
    "BISECT_LOG",
  ]) {
    if (existsSync(git(root, "rev-parse", "--path-format=absolute", "--git-path", marker).trim())) {
      throw new Error(`Active Git operation: ${marker}`);
    }
  }
  const requested = resolve(input.evidence);
  input.evidence = join(realpathSync(dirname(requested)), basename(requested));
  outsideCheckouts(input.evidence);
  if (existsSync(input.evidence)) throw new Error("Evidence must be a new directory");
  if (!lstatSync(join(root, "bun.lock")).isFile()) throw new Error("Missing regular root bun.lock");
}

function reconcileAlias(pkg, original) {
  const version = pkg.devDependencies?.[sdk];
  if (typeof version !== "string" || !Bun.semver.satisfies(version, "*")) {
    throw new Error("Official projection did not produce an SDK version");
  }
  for (const group of ["dependencies", "devDependencies"]) {
    if (original[group]?.[runtime]?.startsWith(`npm:${sdk}@`)) {
      pkg[group][runtime] = `npm:${sdk}@${version}`;
    }
  }
}

function changes(original, projected) {
  const rest = (pkg) =>
    Object.fromEntries(
      Object.entries(pkg).filter(([key]) => !["dependencies", "devDependencies"].includes(key)),
    );
  if (!isDeepStrictEqual(rest(original), rest(projected))) {
    throw new Error("Official projection changed engines or unrelated manifest fields");
  }
  return ["dependencies", "devDependencies"].flatMap((group) =>
    [...new Set([...Object.keys(original[group] ?? {}), ...Object.keys(projected[group] ?? {})])]
      .sort()
      .flatMap((name) => {
        const from = original[group]?.[name] ?? null;
        const to = projected[group]?.[name] ?? null;
        return from === to ? [] : [{ field: `${group}.${name}`, from, to }];
      }),
  );
}

function project(packages, report) {
  const temporaryRoot = realpathSync(tmpdir());
  outsideCheckouts(temporaryRoot);
  const scratch = mkdtempSync(join(temporaryRoot, "bb-sdk-preview-"));
  const projected = [];
  try {
    for (const pkg of packages) {
      const path = join(scratch, pkg.directory);
      mkdirSync(path, { recursive: true, mode: 0o700 });
      copyFileSync(join(pkg.path, "package.json"), join(path, "package.json"));
      const inputs = [
        ...globSync("tsconfig*.json", { cwd: pkg.path }),
        "types/bb-plugin-sdk.d.ts",
        "types/bb-plugin-sdk-app.d.ts",
      ];
      for (const file of inputs) {
        const source = join(pkg.path, file);
        if (!existsSync(source)) continue;
        if (!lstatSync(source).isFile() || realpathSync(source) !== source) {
          throw new Error(`Projection input must be a regular owned file: ${source}`);
        }
        mkdirSync(dirname(join(path, file)), { recursive: true });
        copyFileSync(source, join(path, file));
      }
      const projection = {
        directory: pkg.directory,
        official: run(["bb", "plugin", "types", path], scratch),
        changes: [],
      };
      report.projections.push(projection);
      if (!passed(projection.official))
        throw new Error(`Official projection failed: ${pkg.directory}`);
      const intended = manifest(join(path, "package.json"));
      reconcileAlias(intended, pkg.manifest);
      projection.changes = changes(pkg.manifest, intended);
      projection.declarations = declarations(intended);
      projected.push(intended);
    }
    for (const [index, pkg] of packages.entries()) {
      const engines = pkg.manifest.engines;
      for (const [engine, version] of [
        ["bb", report.host.stdout.trim()],
        ["bbPluginSdk", projected[index].devDependencies[sdk]],
      ]) {
        if (
          typeof engines?.[engine] !== "string" ||
          !Bun.semver.satisfies(version, engines[engine])
        ) {
          throw new Error(
            `Unsupported engine ${engine} for ${pkg.directory}: ${version} does not satisfy ${engines?.[engine] ?? "missing range"}`,
          );
        }
      }
    }
    return projected;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function alignmentStages(packages, evidence) {
  const localCliPackages = packages.filter(
    (pkg) => pkg.manifest.devDependencies?.["bb-app"] ?? pkg.manifest.dependencies?.["bb-app"],
  );
  const localCli = (pkg) => join(pkg.path, "node_modules/.bin/bb");
  const stages = [
    ...packages.map((pkg) => ({
      id: `sync:${pkg.directory}`,
      command: ["bb", "plugin", "types", pkg.path],
    })),
    { id: "lockfile", command: ["bun", "install", "--ignore-scripts"] },
    ...packages.map((pkg) => ({
      id: `postcheck:${pkg.directory}`,
      command: ["bb", "plugin", "types", pkg.path, "--check"],
    })),
    ...localCliPackages.flatMap((pkg) => [
      {
        id: `local-cli-version:${pkg.directory}`,
        command: [localCli(pkg), "--version"],
        cwd: pkg.path,
        packageCli: true,
        expectedVersion:
          pkg.manifest.devDependencies?.["bb-app"] ?? pkg.manifest.dependencies["bb-app"],
      },
      {
        id: `local-postcheck:${pkg.directory}`,
        command: [localCli(pkg), "plugin", "types", pkg.path, "--check"],
        cwd: pkg.path,
        packageCli: true,
      },
    ]),
  ];
  if (packages.some((pkg) => pkg.directory === "bb-plugin-tasks-plus")) {
    stages.push({ id: "sqlite", command: ["sqlite3", "--version"] });
  }
  if (
    packages.some(
      (pkg) => pkg.manifest.dependencies?.["@bb-plugins/markdown-document"] === "workspace:*",
    )
  ) {
    for (const script of ["build", "test", "typecheck"]) {
      stages.push({
        id: `shared:${script}`,
        cwd: join(root, "packages/markdown-document"),
        command: [
          "bun",
          "--no-install",
          "run",
          script,
          ...(script === "test" ? ["--maxWorkers=1"] : []),
        ],
      });
    }
  }
  stages.push({
    id: "review",
    command: [
      "bun",
      "--no-install",
      "run",
      "check:review",
      "--evidence",
      evidence ?? "NEW_EXTERNAL_DIRECTORY",
      ...packages.flatMap((pkg) => ["--package", pkg.directory]),
    ],
  });
  stages.push(
    ...packages.map((pkg) => ({
      id: `build:${pkg.directory}`,
      command: ["bb", "plugin", "build", pkg.path],
    })),
    ...localCliPackages.map((pkg) => ({
      id: `local-build:${pkg.directory}`,
      command: [localCli(pkg), "plugin", "build", pkg.path],
      cwd: pkg.path,
      packageCli: true,
    })),
  );
  return stages.map((stage) => ({ cwd: root, ...stage, status: "skipped", result: null }));
}

function align(input, report) {
  const packages = discover(root, input.packages, input.kind);
  if (input.kind === "apply") applyAuthority(input);
  report.stages = alignmentStages(packages, input.evidence);
  report.checkouts.push(observe(root, packages));
  report.lockfile = "resolution-required-on-apply";
  const projected = project(packages, report);
  if (input.kind === "preview") return true;
  try {
    for (const stage of report.stages) {
      const env = { ...process.env, NODE_ENV: "development" };
      if (stage.packageCli) delete env.BB_CLI;
      stage.result = run(stage.command, stage.cwd, env);
      stage.status = "failed";
      if (stage.id === "lockfile") report.lockfile = "reconciliation-started";
      if (!passed(stage.result)) throw new Error(`Stage failed: ${stage.id}`);
      if (stage.expectedVersion && stage.result.stdout.trim() !== stage.expectedVersion) {
        throw new Error(
          `Stage failed: ${stage.id}, expected bb-app ${stage.expectedVersion}, got ${stage.result.stdout.trim()}`,
        );
      }
      if (stage.id.startsWith("sync:")) {
        const index = packages.findIndex((pkg) => stage.id === `sync:${pkg.directory}`);
        const pkg = packages[index];
        const file = join(pkg.path, "package.json");
        const actual = manifest(file);
        reconcileAlias(actual, pkg.manifest);
        if (!isDeepStrictEqual(actual, projected[index])) {
          stage.status = "failed";
          throw new Error(`Stage failed: ${stage.id}, manifest differs from projection`);
        }
        if (!isDeepStrictEqual(manifest(file), actual)) {
          writeFileSync(file, JSON.stringify(actual, null, 2) + "\n");
        }
      }
      stage.status = "passed";
      if (stage.id === "lockfile") report.lockfile = "reconciled";
    }
    return true;
  } finally {
    report.diff = git(root, "diff", "--binary");
    report.finalStatus = git(root, "status", "--porcelain=v1", "--untracked-files=all");
  }
}

function main(report) {
  if (process.argv.slice(2).join(" ") === "--help") {
    report.usage = usage;
    return true;
  }
  const input = request(process.argv.slice(2));
  report.kind = input.kind;
  report.host = run(["bb", "--version"]);
  if (!passed(report.host)) throw new Error("Cannot read official BB version");
  if (input.kind !== "audit") return align(input, report);
  for (const path of input.allWorktrees ? worktrees() : [root]) {
    try {
      report.checkouts.push(
        observe(realpathSync(path), discover(realpathSync(path), input.packages, input.kind)),
      );
    } catch (error) {
      report.checkouts.push({ path, error: error.message, packages: [] });
    }
  }
  return report.checkouts.every(
    (checkout) => !checkout.error && checkout.packages.every((pkg) => pkg.status === "current"),
  );
}

const report = { kind: null, host: null, checkouts: [], projections: [], stages: [], error: null };
try {
  process.exitCode = main(report) ? 0 : 1;
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
}
console.log(JSON.stringify(report, null, 2));
