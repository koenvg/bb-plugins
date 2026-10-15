import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const outdir = fileURLToPath(
  new URL("../../verification/subagent-viewer-implementation/", import.meta.url),
);
await mkdir(outdir, { recursive: true });
const result = await Bun.build({
  entrypoints: [fileURLToPath(new URL("./viewer-preview.tsx", import.meta.url))],
  outdir,
  target: "browser",
  define: { "process.env.NODE_ENV": '"development"' },
});
if (!result.success) {
  console.error(result.logs);
  process.exit(1);
}
await Bun.write(
  `${outdir}/index.html`,
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Subagent viewer source preview</title><link rel="stylesheet" href="viewer-preview.css"><style>
:root { --foreground:#222; --background:#fff; --card:#f8f8f8; --surface-raised:#f3f3f3; --muted-foreground:#595959; --border:#d0d0d0; --ring:#555; --timeline-accent:#2563eb; --success:#287a43; --attention:#956000; --warning-text:#956000; --destructive:#b42318; --state-hover:#eee; --state-active:#e5e5e5; --radius:6px; }
:root[data-theme=dark] { --foreground:#eee; --background:#212121; --card:#262626; --surface-raised:#2a2a2a; --muted-foreground:#b6b6b6; --border:#424242; --ring:#aaa; --timeline-accent:#8ab4f8; --success:#8bc99d; --attention:#e5b866; --warning-text:#e5b866; --destructive:#ff9189; --state-hover:#2c2c2c; --state-active:#343434; }
html,body { margin:0; height:100%; background:var(--background); color:var(--foreground); font-family:system-ui; }
body { display:flex; flex-direction:column; }
#preview-limit { margin:0; padding:8px 12px; font-size:12px; color:var(--muted-foreground); flex-shrink:0; }
#root { flex:1; min-height:0; min-width:0; }
[data-testid=bb-markdown] { white-space:pre-wrap; line-height:1.6; }
</style><p id="preview-limit">Unsigned source preview. SDK harness Markdown is plain text, not installed-host rendering.</p><main id="root"></main><script type="module" src="viewer-preview.js"></script></html>`,
);
console.log(outdir);
