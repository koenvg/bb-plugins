import { build } from "esbuild";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { reportPreviewReady } from "../../scripts/browser-fixture-runner.mjs";

const scripts = dirname(fileURLToPath(import.meta.url));
const packageRoot = dirname(scripts);
const requested = process.env.CODEX_QUOTA_PREVIEW_PORT ?? process.env.BB_FIXTURE_PORT ?? "0";
if (!/^\d+$/.test(requested) || Number(requested) > 65535)
  throw new Error("Invalid CODEX_QUOTA_PREVIEW_PORT (expected 0 through 65535)");
const port = Number(requested);
const suites = [
  "activity",
  "collector",
  "identity",
  `import`,
  "calendar",
  "speed",
  "saved",
  "footer",
];
let root;
let server;
const cancellation = new AbortController();
const cancel = () => cancellation.abort();
process.on("SIGINT", cancel);
process.on("SIGTERM", cancel);
try {
  root = await mkdtemp(join(process.env.BB_FIXTURE_RUN_DIR ?? tmpdir(), "codex-quota-preview-"));
  cancellation.signal.throwIfAborted();
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
  cancellation.signal.throwIfAborted();
  const { prepareSpeedFixture } = await import(pathToFileURL(fixtureArtifact).href);
  const speedReports = await prepareSpeedFixture(join(packageRoot, "fixtures"));
  cancellation.signal.throwIfAborted();
  const css = await compile(await readFile(join(scripts, "preview.css"), "utf8"), {
    base: scripts,
    onDependency() {},
  });
  cancellation.signal.throwIfAborted();
  const scanner = new Scanner({
    sources: [
      { base: join(packageRoot, "src"), pattern: "**/*", negated: false },
      { base: scripts, pattern: "*-preview.tsx", negated: false },
    ],
  });
  await writeFile(join(root, "app.css"), css.build(scanner.scan()));
  const html = await readFile(join(scripts, "activity-preview.html"), "utf8");
  for (const suite of suites) {
    cancellation.signal.throwIfAborted();
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
  cancellation.signal.throwIfAborted();
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
    server.listen(port, "127.0.0.1", resolve);
  });
  cancellation.signal.throwIfAborted();
  const origin = new URL(`http://127.0.0.1:${server.address().port}`).origin;
  console.log(`Synthetic preview ready at ${origin} (${root})`);
  reportPreviewReady(origin);
  await new Promise((resolve) =>
    cancellation.signal.addEventListener("abort", resolve, { once: true }),
  );
} catch (error) {
  if (!cancellation.signal.aborted) throw error;
} finally {
  try {
    if (server?.listening) {
      const closed = new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      server.closeAllConnections();
      await closed;
    }
  } finally {
    if (root) await rm(root, { recursive: true, force: true });
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
  }
}
