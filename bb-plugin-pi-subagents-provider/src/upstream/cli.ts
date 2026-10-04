import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkUpstream, runOutput, type Transport } from "./checker.ts";
import { readCommittedBaseline } from "./source.ts";
import { githubTransport } from "./transport.ts";

export async function checkerCommand(args: string[], options: {
  readBaseline?: (packageDir: string) => Promise<unknown>; transport?: Transport;
  now?: () => number; projectId?: string; nodeVersion?: string;
} = {}) {
  const fail = (reason: string) => runOutput({ status: "inconclusive", reason });
  if (args.length !== 4 || args[0] !== "--source" || args[2] !== "--project" ||
      !isAbsolute(args[1]) || /[\x00-\x1f\x7f]/.test(args[1]) || !/^proj_[A-Za-z0-9_-]{1,100}$/.test(args[3])) {
    return fail("Usage: --source ABSOLUTE_PACKAGE_PATH --project PROJECT_ID");
  }
  if (options.projectId !== undefined && options.projectId !== args[3]) return fail("Automation project does not match explicit scope");
  const version = (options.nodeVersion ?? process.versions.node).split(".").map(Number);
  if (!/^24\.\d+\.\d+$/.test(options.nodeVersion ?? process.versions.node) || version[1] < 15) return fail("Checker requires Node 24.15.0 or newer within Node 24");
  try {
    const baseline = await (options.readBaseline ?? readCommittedBaseline)(args[1]);
    return runOutput(await checkUpstream(baseline, {
      transport: options.transport ?? githubTransport(), now: options.now ?? (() => performance.now()),
    }));
  } catch { return fail("Committed baseline or checker prerequisites are unavailable"); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = await checkerCommand(process.argv.slice(2), { projectId: process.env.BB_PROJECT_ID });
  process.stdout.write(output.stdout);
  process.stderr.write(output.stderr);
  process.exitCode = output.exitCode;
}
