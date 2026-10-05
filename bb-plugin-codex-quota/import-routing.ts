import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { importViewSchema, importUnavailable, type ImportCommand } from "./import-contract.js";
import type { HistoryRequest } from "./history-contract.js";
import { historyReadinessSchema } from "./history-contract.js";
import type { SelectedHost } from "./selected-host.js";

type Dependencies = {
  session: SelectedHost;
  sdk: Pick<BbPluginApi["sdk"], "environments">;
  prepare(input: HistoryRequest): Promise<unknown>;
  call(
    hostId: string,
    signal: AbortSignal,
    input: {
      hostId: string;
      command: ImportCommand;
      knownWorkspaces: string[];
    },
  ): Promise<unknown>;
};
export function createImportHandler(deps: Dependencies) {
  const work = new Map<AbortController, HistoryRequest>();
  return async (input: HistoryRequest & { command: ImportCommand }) => {
    const { hostId, generation, command } = input;
    if (command.action === "cancel") {
      for (const [pending, scope] of work) {
        if (scope.hostId === hostId && scope.generation === generation) pending.abort();
      }
    }
    const controller = new AbortController();
    if (command.action === "start" || command.action === "resume")
      work.set(controller, { hostId, generation });
    try {
      return await deps.session.request(input, {
        schema: importViewSchema,
        unavailable: importUnavailable,
        signal: controller.signal,
        call: async (signal) => {
          if (command.action === "start" || command.action === "resume") {
            const prepared = historyReadinessSchema.safeParse(
              await deps.prepare({ hostId, generation }),
            );
            signal.throwIfAborted();
            const attribution = prepared.success
              ? (prepared.data.collection?.attribution ?? prepared.data.attribution)
              : null;
            if (command.action === "start" && attribution && attribution.discovery !== "complete")
              return importUnavailable("metadata-incomplete");
          }
          const knownWorkspaces: string[] = [];
          if (command.action === "configure" || command.action === "start") {
            for (let offset = 0; offset < 200; offset += 50) {
              const page = await deps.sdk.environments.list({ offset, limit: 50, signal });
              signal.throwIfAborted();
              for (const env of page) {
                if (env.hostId === hostId && env.path && knownWorkspaces.length < 50)
                  knownWorkspaces.push(env.path);
              }
              if (page.length < 50) break;
            }
          }
          signal.throwIfAborted();
          return deps.call(hostId, signal, { hostId, command, knownWorkspaces });
        },
      });
    } finally {
      work.delete(controller);
    }
  };
}
