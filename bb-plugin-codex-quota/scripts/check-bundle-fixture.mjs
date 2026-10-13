import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));

async function runCheck(body) {
  const temp = mkdtempSync(join(tmpdir(), "bundle-fixture-test-"));
  try {
    const sentinel = join(temp, "keep.txt");
    writeFileSync(sentinel, "unowned");
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", body], {
      cwd: scriptDir,
      env: { ...process.env, TMPDIR: temp },
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.ifError(result.error);
    const root = result.stdout.trim();
    assert.ok(root.startsWith(join(temp, "owned-")), "Child reports its exact owned root");
    const absentAtCompletion = !existsSync(root);
    await sleep(100);
    assert.equal(existsSync(root), false, "Owned root remains absent after a bounded delay");
    assert.equal(readFileSync(sentinel, "utf8"), "unowned");
    return { ...result, absentAtCompletion };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

test("natural exit drains late owned writes before exact fixture deletion", async () => {
  const result = await runCheck(`
    import { existsSync, writeFileSync } from "node:fs";
    import { createBundleFixture } from "./bundle-fixture.mjs";
    const root = createBundleFixture("owned-");
    console.log(root);
    setTimeout(() => {
      if (!existsSync(root)) throw Error("Fixture removed before owned writer drained");
      writeFileSync(root + "/late.json", "{}");
    }, 30);
  `);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.absentAtCompletion, true);
});

test("a failed check keeps its original error and still removes its root", async () => {
  const result = await runCheck(`
    import { createBundleFixture } from "./bundle-fixture.mjs";
    console.log(createBundleFixture("owned-"));
    throw Error("original synthetic check failure");
  `);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /original synthetic check failure/);
  assert.equal(result.absentAtCompletion, true);
});

for (const status of [0, 7]) {
  test(`cleanup errors preserve an existing exit status, status ${status}`, () => {
    // The observer owns and removes the retained root after the injected failure.
    const temp = mkdtempSync(join(tmpdir(), "bundle-fixture-failure-"));
    try {
      const result = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          `
        import fs from "node:fs";
        import { syncBuiltinESMExports } from "node:module";
        fs.rmSync = () => { throw Error("synthetic cleanup failure"); };
        syncBuiltinESMExports();
        const { createBundleFixture } = await import("./bundle-fixture.mjs");
        console.log(createBundleFixture("owned-"));
        process.exitCode = ${status};
      `,
        ],
        {
          cwd: scriptDir,
          env: { ...process.env, TMPDIR: temp },
          encoding: "utf8",
          timeout: 10_000,
        },
      );
      assert.ifError(result.error);
      assert.equal(result.status, status || 1);
      assert.match(result.stderr, /synthetic cleanup failure/);
      assert.ok(result.stdout.trim().startsWith(join(temp, "owned-")));
      assert.ok(existsSync(result.stdout.trim()), "Failed cleanup retains ownership evidence");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
}
