import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { reportPreviewReady } from "../../scripts/browser-fixture-runner.mjs";

const tests = dirname(fileURLToPath(import.meta.url));
const requested = process.env.PI_SUBAGENTS_PREVIEW_PORT ?? process.env.BB_FIXTURE_PORT ?? "0";
if (!/^\d+$/.test(requested) || Number(requested) > 65535)
  throw new Error("Invalid PI_SUBAGENTS_PREVIEW_PORT (expected 0 through 65535)");
const port = Number(requested);
let root;
let server;
const cancellation = new AbortController();
const cancel = () => cancellation.abort();
process.on("SIGINT", cancel);
process.on("SIGTERM", cancel);
try {
  root = await mkdtemp(join(process.env.BB_FIXTURE_RUN_DIR ?? tmpdir(), "pi-subagents-preview-"));
  cancellation.signal.throwIfAborted();
  await build({
    entryPoints: [join(tests, "preview.tsx")],
    outfile: join(root, "app.js"),
    bundle: true,
    platform: "browser",
    format: "esm",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
  });
  cancellation.signal.throwIfAborted();
  await writeFile(
    join(root, "index.html"),
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:,">
<title>Synthetic Subagents preview</title>
<link rel="stylesheet" href="/app.css">
<style>
:root {
  color-scheme: light;
  --foreground: #202124;
  --muted-foreground: #555b65;
  --border: #d5d8dd;
  --ring: #305baf;
  --card: #fff;
  --state-hover: #eef2f8;
  --state-active: #e1e8f4;
  --success: #256637;
  --radius: 4px;
}
html, body { margin: 0; height: 100%; font-family: system-ui, sans-serif; background: #fff; }
#root { height: 100dvh; width: 100%; max-width: 100%; }
</style>
</head>
<body><div id="root"></div><script type="module" src="/app.js"></script></body>
</html>`,
  );
  cancellation.signal.throwIfAborted();
  const assets = new Map([
    ["/", ["index.html", "text/html"]],
    ["/app.js", ["app.js", "text/javascript"]],
    ["/app.css", ["app.css", "text/css"]],
  ]);
  server = createServer(async (request, response) => {
    const asset = assets.get(new URL(request.url, "http://127.0.0.1").pathname);
    if (!asset || !["GET", "HEAD"].includes(request.method)) {
      response.writeHead(404).end();
      return;
    }
    try {
      const body = await readFile(join(root, asset[0]));
      response
        .writeHead(200, {
          "Content-Type": asset[1],
          "Cache-Control": "no-store",
          "Content-Security-Policy":
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data:; object-src 'none'; base-uri 'none'",
        })
        .end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(500).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  cancellation.signal.throwIfAborted();
  const origin = `http://127.0.0.1:${server.address().port}`;
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
