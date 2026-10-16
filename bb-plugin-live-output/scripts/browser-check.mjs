import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const evidence =
  process.env.LIVE_OUTPUT_EVIDENCE || (await mkdtemp(join(tmpdir(), "live-output-browser-")));
await mkdir(join(evidence, "fixture"), { recursive: true });
const build = await Bun.build({
  entrypoints: [resolve("scripts/browser/fixture.test.tsx")],
  outdir: join(evidence, "fixture"),
  target: "browser",
  naming: "browser-fixture.[ext]",
  sourcemap: "external",
});
if (!build.success) throw new AggregateError(build.logs, "Synthetic fixture bundle failed");
const html = await readFile("scripts/browser-fixture.html", "utf8");
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/" || path === "/fixture.html")
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    if (path === "/browser-fixture.js" || path === "/browser-fixture.js.map")
      return new Response(Bun.file(join(evidence, "fixture", path.slice(1))));
    return new Response("Not found", { status: 404 });
  },
});
try {
  const command = [
    "bun",
    "x",
    "--no-install",
    "playwright",
    "test",
    "--config",
    "scripts/playwright.config.mjs",
    ...process.argv.slice(2),
  ];
  await writeFile(
    join(evidence, "browser-command.json"),
    JSON.stringify(
      {
        command,
        baseURL: server.url.href,
        executablePath:
          "/Users/koen/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        downloads: false,
        syntheticOnly: true,
      },
      null,
      2,
    ),
  );
  const child = Bun.spawn(command, {
    env: { ...process.env, LIVE_OUTPUT_EVIDENCE: evidence, LIVE_OUTPUT_BASE_URL: server.url.href },
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exitCode = await child.exited;
} finally {
  await server.stop(true);
}
