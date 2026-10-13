import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function createBundleFixture(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  // Pi registerNativeProvider starts an unawaited local refresh. Host disposal
  // does not drain its auth/models-store writes. Let Node drain the owned check
  // process first; no async writer can run once the exit event starts.
  process.once("exit", () => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch (error) {
      console.error(`Could not remove owned bundle fixture ${root}:`, error);
      // Report cleanup failure without replacing an existing check failure.
      if (!process.exitCode) process.exitCode = 1;
    }
  });
  return root;
}
