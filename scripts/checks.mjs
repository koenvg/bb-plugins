import { execFileSync, spawnSync } from "node:child_process";
import {
  appendFileSync,
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = realpathSync(dirname(dirname(fileURLToPath(import.meta.url))));
const rootScripts = [
  "test:setup",
  "test:workspaces",
  "test:browser-lifecycle",
  "test:review",
  "lint",
  "format:check",
];
const command = ["bun", "--no-install", "run"];

function options(args) {
  const mode = args.shift();
  if (mode === "root" && args.length === 0) return { packages: [], evidence: null };
  if (mode !== "review") throw new Error("Use root or review --evidence NEW_DIR [--package NAME]");
  const packages = [];
  let evidence;
  while (args.length) {
    const flag = args.shift();
    const value = args.shift();
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    if (flag === "--evidence" && evidence === undefined) {
      evidence = value;
    } else if (flag === "--package") {
      if (!/^bb-plugin-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
        throw new Error(`Invalid package: ${value}`);
      }
      if (packages.includes(value)) throw new Error(`Duplicate package: ${value}`);
      if (!lstatSync(join(root, value)).isDirectory()) {
        throw new Error(`Package must be a direct directory: ${value}`);
      }
      packages.push(value);
    } else {
      throw new Error(`Unknown or duplicate argument: ${flag}`);
    }
  }
  if (!evidence) throw new Error("Review requires --evidence NEW_DIR");
  const requested = resolve(evidence);
  evidence = join(realpathSync(dirname(requested)), basename(requested));
  if (evidence === root || evidence.startsWith(root + sep)) {
    throw new Error("Evidence must be outside the checkout");
  }
  return { packages, evidence };
}

function runCheck(check, evidence) {
  const result = { id: check.id, log: check.log, exitCode: null, signal: null, error: null };
  let log;
  try {
    if (evidence) {
      log = openSync(join(evidence, check.log), "wx", 0o600);
      writeSync(
        log,
        `cwd: ${check.cwd}\ncommand: ${JSON.stringify([...command, check.script])}\n\n`,
      );
    }
    const manifest = JSON.parse(readFileSync(join(check.cwd, "package.json"), "utf8"));
    if (
      typeof manifest.scripts?.[check.script] !== "string" ||
      !manifest.scripts[check.script].trim()
    ) {
      throw new Error(`Missing script: ${check.script} in ${check.cwd}`);
    }
    const child = spawnSync(command[0], [...command.slice(1), check.script], {
      cwd: check.cwd,
      stdio: ["ignore", log ?? "inherit", log ?? "inherit"],
    });
    result.exitCode = child.status ?? null;
    result.signal = child.signal ?? null;
    result.error = child.error?.message ?? null;
  } catch (error) {
    result.error = error.message;
  } finally {
    if (log !== undefined) {
      try {
        if (result.error) writeSync(log, `\nerror: ${result.error}\n`);
        closeSync(log);
      } catch (error) {
        result.error = [result.error, error.message].filter(Boolean).join("; ");
      }
    }
  }
  return result;
}

function main() {
  const { packages, evidence } = options(process.argv.slice(2));
  const checks = [
    ...rootScripts.map((script) => ({ id: `root:${script}`, cwd: root, script })),
    ...packages.flatMap((name) =>
      ["test", "typecheck"].map((script) => ({
        id: `${name}:${script}`,
        cwd: join(root, name),
        script,
      })),
    ),
  ].map((check, index) => ({
    ...check,
    log: evidence ? `${String(index + 1).padStart(2, "0")}.log` : null,
  }));
  if (evidence) {
    mkdirSync(evidence, { mode: 0o700 });
    console.log(`Evidence: ${evidence}`);
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    const status = execFileSync("git", ["status", "--porcelain=v1"], {
      cwd: root,
      encoding: "utf8",
    });
    writeFileSync(
      join(evidence, "plan.json"),
      JSON.stringify({ head, status, packages, command, checks }, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    writeFileSync(join(evidence, "results.jsonl"), "", { flag: "wx", mode: 0o600 });
  }
  const results = [];
  const evidenceErrors = [];
  for (const check of checks) {
    const result = runCheck(check, evidence);
    results.push(result);
    console.log(
      `${result.id} exit=${result.exitCode ?? "unavailable"}${result.signal ? ` signal=${result.signal}` : ""}${result.error ? ` error=${result.error}` : ""}`,
    );
    if (evidence) {
      try {
        appendFileSync(join(evidence, "results.jsonl"), JSON.stringify(result) + "\n");
      } catch (error) {
        evidenceErrors.push(error.message);
        console.error(error.message);
      }
    }
  }
  const passed =
    evidenceErrors.length === 0 &&
    results.every(
      (result) => result.exitCode === 0 && result.signal === null && result.error === null,
    );
  if (evidence) {
    writeFileSync(
      join(evidence, "summary.json"),
      JSON.stringify({ passed, results, evidenceErrors }, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
  }
  return passed ? 0 : 1;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
