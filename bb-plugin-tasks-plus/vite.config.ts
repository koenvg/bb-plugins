import { defineConfig } from "vite";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { previewDocument } from "./tests/preview-document";
export default defineConfig({
  plugins: [
    tailwind(),
    {
      name: "preview-document-download",
      apply: "serve",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const url = new URL(request.url || "/", "http://127.0.0.1");
          if (url.pathname.startsWith("/tests/assets/")) {
            if (url.pathname.endsWith("redirect.png")) {
              response.writeHead(302, {
                Location: `http://127.0.0.1:${request.socket.localPort}/api/redirect-private-image`,
                "Access-Control-Allow-Origin": "*",
              });
              response.end();
              return;
            }
            if (!url.pathname.endsWith("cors.png"))
              response.setHeader("Access-Control-Allow-Origin", "*");
            else response.removeHeader("Access-Control-Allow-Origin");
            response.setHeader("Content-Type", "image/png");
            response.end(
              url.pathname.endsWith("broken.png")
                ? Buffer.from("not an image")
                : readFileSync(new URL("./tests/fixtures/chart.png", import.meta.url)),
            );
            return;
          }
          if (url.pathname !== "/api/v1/plugins/tasks-plus/http/attachments/download")
            return next();
          const ids = url.searchParams.getAll("attachmentId");
          if (request.method !== "GET" || ids.length !== 1 || ids[0] !== previewDocument.id) {
            response.statusCode = 404;
            response.end();
            return;
          }
          response.setHeader("Content-Type", previewDocument.mime);
          response.setHeader(
            "Content-Disposition",
            `attachment; filename="${previewDocument.fileName}"`,
          );
          response.end(Buffer.from(previewDocument.source, "utf8"));
        });
      },
    },
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
    dedupe: ["react", "react-dom"],
  },
});
