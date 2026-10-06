import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { readConfig, settingsDefinition } from "./config.js";
import { remoteAccess } from "./remote-access.js";

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define(settingsDefinition);
  let saved = await settings.get();
  const initial = readConfig(saved);
  const connection = { publicOrigin: saved.publicOrigin, port: saved.port };
  const access = initial
    ? remoteAccess({
        connection,
        policy: () => readConfig(saved),
        projects: { list: () => bb.sdk.projects.list() },
        log: (event) => bb.log.warn(JSON.stringify(event)),
      })
    : null;

  settings.onChange((next) => {
    saved = next;
    if (!readConfig(next)?.remoteEnabled) void access?.close();
  });
  bb.onDispose(async () => {
    await access?.close();
  });
  bb.background.service("listener", {
    async start(signal) {
      const stop = () => {
        void access?.close();
      };
      signal.addEventListener("abort", stop, { once: true });
      try {
        if (!signal.aborted && readConfig(saved)?.remoteEnabled) await access?.start();
        if (!signal.aborted)
          await new Promise<void>((resolve) =>
            signal.addEventListener("abort", () => resolve(), { once: true }),
          );
      } finally {
        signal.removeEventListener("abort", stop);
        await access?.close();
      }
    },
  });
  bb.cli.register({
    name: "mcp",
    summary: "Show local MCP readiness. Public reachability needs an external check.",
    commands: [{ name: "status", summary: "Show listener state", usage: "bb mcp status [--json]" }],
    async run(argv) {
      if (
        argv[0] !== "status" ||
        argv.length > 2 ||
        (argv[1] !== undefined && argv[1] !== "--json")
      ) {
        return { exitCode: 1, stderr: "Usage: bb mcp status [--json]" };
      }
      const current = readConfig(saved);
      const status = {
        ...(access?.status() ?? {
          url: null,
          port: null,
          listener: "stopped",
          publicReachability: "unverified",
        }),
        configuration: current ? "valid" : "invalid",
        remoteEnabled: current?.remoteEnabled ?? false,
        controlTools: "unavailable",
        reloadRequired:
          !access ||
          connection.publicOrigin !== saved.publicOrigin ||
          connection.port !== saved.port ||
          (current?.remoteEnabled && access.status().listener === "stopped"),
        prerequisites:
          "Existing tunnel, compatible OAuth issuer, and ChatGPT connection require operator setup.",
      };
      return {
        exitCode: 0,
        stdout: JSON.stringify(status, null, argv.includes("--json") ? undefined : 2),
      };
    },
  });
}
