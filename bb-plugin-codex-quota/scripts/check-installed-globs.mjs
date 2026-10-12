import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Use parent-aware ESM resolution without loading Pi or starting its runtime.
try {
  const root = pathToFileURL(resolve("package.json")).href;
  const pi = import.meta.resolve("@earendil-works/pi-coding-agent", root);
  const minimatch = import.meta.resolve("minimatch", pi);
  const brace = import.meta.resolve("brace-expansion", minimatch);
  const manifestPath = import.meta.resolve("brace-expansion/package.json", minimatch);
  const manifest = JSON.parse(readFileSync(new URL(manifestPath), "utf8"));
  assert.equal(manifest.name, "brace-expansion", `Unexpected package at ${manifestPath}`);

  // Pi's accepted graph uses major 5. Reject older versions and prereleases.
  // 5.0.12 fixes GHSA-qhr7-859c-m2p7, GHSA-6j4f-fj2g-mc7p, GHSA-q2hr-2g5m-vwhr.
  const version = /^(\d+)\.(\d+)\.(\d+)$/.exec(manifest.version);
  const [major, minor, patch] = version ? version.slice(1).map(Number) : [];
  assert.ok(
    version && (major > 5 || (major === 5 && (minor > 0 || patch >= 12))),
    `Pi -> minimatch -> brace-expansion installed ${manifest.version} at ${manifestPath}; ` +
      "requires stable >=5.0.12. Update the upstream dependency that selects this copy, " +
      "then run bun install --frozen-lockfile and this check again. Parent lockfile edits or audit output are not proof of a fix.",
  );

  // Bounded ordinary inputs only. Do not run denial-of-service payloads in CI.
  const { expand } = await import(brace);
  const { minimatch: matches } = await import(minimatch);
  assert.deepEqual(expand("file-{1..3}.ts"), ["file-1.ts", "file-2.ts", "file-3.ts"]);
  assert.equal(matches("src/account.ts", "src/*.{ts,tsx}"), true);
  assert.equal(matches("src/account.tsx", "src/*.{ts,tsx}"), true);
  assert.equal(matches("src/account.js", "src/*.{ts,tsx}"), false);
  assert.equal(matches("other/account.ts", "src/*.{ts,tsx}"), false);
  console.log(
    `Installed glob guard passed: Pi -> ${minimatch} -> ${manifestPath} @ ${manifest.version}`,
  );
} catch (error) {
  console.error(`Installed glob guard failed: ${error.message}`);
  console.error(
    "Run bun install --frozen-lockfile in bb-plugin-codex-quota, then bun run check:installed-globs.",
  );
  process.exitCode = 1;
}
