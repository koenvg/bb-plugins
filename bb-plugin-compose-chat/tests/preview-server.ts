import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

// Build the real app entry on every run. Serve in memory so a BB build in dist stays intact.
const root = new URL("../", import.meta.url);
const bundle = await build({
  absWorkingDir: fileURLToPath(root),
  entryPoints: ["app.tsx"],
  outfile: "dist/app.js",
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  write: false,
});
const assets = new Map<string, { body: Uint8Array; type: string }>();
for (const output of bundle.outputFiles) {
  const name = output.path.endsWith(".css") ? "app.css" : "app.js";
  assets.set(`/dist/${name}`, {
    body: output.contents,
    type: name.endsWith(".css") ? "text/css" : "text/javascript",
  });
}
for (const [name, type] of [
  ["preview.html", "text/html"],
  ["browser-checks.js", "text/javascript"],
  ["voice-fixture.js", "text/javascript"],
  ["fixture-shine.svg", "image/svg+xml"],
]) {
  assets.set(`/tests/${name}`, { body: await readFile(new URL(`tests/${name}`, root)), type });
}
const server = createServer((request, response) => {
  const path = new URL(request.url ?? "/", "http://127.0.0.1:56429").pathname;
  const asset = assets.get(path);
  if (!asset || !["GET", "HEAD"].includes(request.method ?? "")) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type": `${asset.type}; charset=utf-8`,
    "Cache-Control": "no-store",
  });
  response.end(request.method === "HEAD" ? undefined : asset.body);
});
server.listen(56429, "127.0.0.1");
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => server.close());
}
