// Builds only synthetic browser fixtures. No BB CLI, host, or installed state.
import { build } from "esbuild";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scripts = dirname(fileURLToPath(import.meta.url));
const packageRoot = dirname(scripts);
const root = await mkdtemp(join(tmpdir(), "codex-quota-preview-"));
const suites = ["activity", "collector", "identity", `import`, "calendar", "speed"];
let server;
try {
  // Node also runs this preview lifecycle test. Compile .js-to-.ts source imports before loading.
  const fixtureArtifact = join(root, "speed-fixture.mjs");
  await build({
    entryPoints: [join(scripts, "prepare-speed-fixture.ts")],
    outfile: fixtureArtifact,
    bundle: true,
    platform: "node",
    format: "esm",
    plugins: [
      {
        name: "fixture-dependencies",
        setup(builder) {
          // Keep installed dependencies at their real package roots, including Pi's runtime metadata.
          builder.onResolve({ filter: /^[^./]/ }, (args) => ({
            path: import.meta.resolve(args.path),
            external: true,
          }));
        },
      },
    ],
  });
  const { prepareSpeedFixture } = await import(pathToFileURL(fixtureArtifact).href);
  const speedReports = await prepareSpeedFixture(join(packageRoot, "fixtures"));
  const css = await compile(await readFile(join(scripts, "preview.css"), "utf8"), {
    base: scripts,
    onDependency() {},
  });
  const scanner = new Scanner({
    sources: [
      { base: join(packageRoot, "src"), pattern: "**/*", negated: false },
      { base: scripts, pattern: "*-preview.tsx", negated: false },
    ],
  });
  await writeFile(join(root, "app.css"), css.build(scanner.scan()));
  const html = await readFile(join(scripts, "activity-preview.html"), "utf8");
  for (const suite of suites) {
    await build({
      entryPoints: [join(scripts, `${suite}-preview.tsx`)],
      outfile: join(root, `${suite}.js`),
      bundle: true,
      platform: "browser",
      format: "esm",
      jsx: "automatic",
      // The public SDK testing renderer uses React.act, which requires the development build.
      define: {
        "process.env.NODE_ENV": '"development"',
        __SPEED_REPORTS__: JSON.stringify(speedReports),
      },
    });
    await writeFile(
      join(root, `${suite}.html`),
      html
        .replace("activity-preview.js", `${suite}.js`)
        .replace('href="app.css"', 'href="/app.css"'),
    );
  }
  server = createServer(async (request, response) => {
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    const name = path === "/" ? "activity.html" : path.slice(1);
    if (
      !["app.css", ...suites.flatMap((suite) => [`${suite}.js`, `${suite}.html`])].includes(name)
    ) {
      response.writeHead(404).end();
      return;
    }
    try {
      const body = await readFile(join(root, name));
      response
        .writeHead(200, {
          "Content-Type": name.endsWith(".js")
            ? "text/javascript"
            : name.endsWith(".css")
              ? "text/css"
              : "text/html",
          "Content-Security-Policy":
            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'",
        })
        .end(body);
    } catch {
      response.writeHead(500).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(process.env.CODEX_QUOTA_PREVIEW_PORT ?? 38716), "127.0.0.1", resolve);
  });
  console.log(`Synthetic preview ready at http://127.0.0.1:${server.address().port} (${root})`);
  await new Promise((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
} finally {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  // This fresh directory is never served from the checkout and never reused.
  await rm(root, { recursive: true, force: true });
}
