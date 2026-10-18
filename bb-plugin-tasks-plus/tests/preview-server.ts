import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import { reportPreviewReady } from "../../scripts/browser-fixture-runner.mjs";

const requested = process.env.BB_FIXTURE_PORT ?? "0";
if (!/^\d+$/.test(requested) || Number(requested) > 65535)
  throw new Error("Invalid Tasks preview port (expected 0 through 65535)");

const http = createServer();
const cancellation = new AbortController();
const cancel = () => cancellation.abort();
process.on("SIGINT", cancel);
process.on("SIGTERM", cancel);
let cache: string | undefined;
let vite: ViteDevServer | undefined;
try {
  cache = await mkdtemp(join(process.env.BB_FIXTURE_RUN_DIR ?? tmpdir(), "tasks-preview-"));
  cancellation.signal.throwIfAborted();
  const root = fileURLToPath(new URL("../", import.meta.url));
  vite = await createViteServer({
    root,
    configFile: join(root, "vite.config.ts"),
    cacheDir: cache,
    server: {
      host: "127.0.0.1",
      middlewareMode: { server: http },
      hmr: { server: http },
    },
  });
  cancellation.signal.throwIfAborted();
  http.on("request", vite.middlewares);
  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(Number(requested), "127.0.0.1", resolve);
  });
  cancellation.signal.throwIfAborted();
  const address = http.address();
  if (!address || typeof address === "string") throw new Error("Expected owned loopback listener");
  const origin = `http://127.0.0.1:${address.port}`;
  console.log(`Synthetic preview ready at ${origin} (${cache})`);
  reportPreviewReady(origin);
  await new Promise<void>((resolve) =>
    cancellation.signal.addEventListener("abort", () => resolve(), { once: true }),
  );
} catch (error) {
  if (!cancellation.signal.aborted) throw error;
} finally {
  try {
    const closed = http.listening
      ? new Promise<void>((resolve, reject) =>
          http.close((error) => (error ? reject(error) : resolve())),
        )
      : Promise.resolve();
    http.closeAllConnections();
    try {
      const optimizer = vite?.environments.client.depsOptimizer;
      await Promise.allSettled([optimizer?.scanProcessing]);
      await Promise.allSettled(
        Object.values(optimizer?.metadata.discovered ?? {}).map((info) => info.processing),
      );
    } finally {
      try {
        await Promise.all(
          Object.values(vite?.environments ?? {}).map((environment) => environment.close()),
        );
        await vite?.close();
      } finally {
        await closed;
      }
    }
  } finally {
    if (cache) await rm(cache, { recursive: true, force: true });
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
  }
}
