import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  importViewSchema,
  importUnavailable,
  type ImportCommand,
} from "./import-contract.js";
import type { HistoryRequest } from "./history-contract.js";
import { historyReadinessSchema } from "./history-contract.js";
type Dependencies = {
  selection(): { hostId: string | null; generation: number };
  enrolled(hostId: string): Promise<{ status: string } | null>;
  activeReads: Set<AbortController>;
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
  const work = new Map<
    AbortController,
    { hostId: string; generation: number }
  >();
  return async (input: HistoryRequest & { command: ImportCommand }) => {
    const { hostId, generation, command } = input;
    const s = deps.selection();
    if (!s.hostId) return importUnavailable("no-selection");
    if (s.hostId !== hostId) return importUnavailable("foreign-host");
    if (s.generation !== generation)
      return importUnavailable("selection-changed");
    if (command.action === "cancel") {
      for (const [pending, scope] of work) {
        if (scope.hostId === hostId && scope.generation === generation)
          pending.abort();
      }
    }
    const controller = new AbortController();
    deps.activeReads.add(controller);
    if (command.action === "start" || command.action === "resume")
      work.set(controller, { hostId, generation });
    const changed = () =>
      controller.signal.aborted ||
      deps.selection().hostId !== hostId ||
      deps.selection().generation !== generation;
    try {
      const host = await deps.enrolled(hostId);
      if (changed()) return importUnavailable("selection-changed");
      if (!host || host.status !== "connected")
        return importUnavailable("host-offline");
      if (command.action === "start" || command.action === "resume") {
        const prepared = historyReadinessSchema.safeParse(
          await deps.prepare({ hostId, generation }),
        );
        if (changed()) return importUnavailable("selection-changed");
        const attribution = prepared.success
          ? (prepared.data.collection?.attribution ?? prepared.data.attribution)
          : null;
        if (
          command.action === "start" &&
          attribution &&
          attribution.discovery !== "complete"
        )
          return importUnavailable("metadata-incomplete");
      }
      const knownWorkspaces: string[] = [];
      if (command.action === "configure" || command.action === "start") {
        for (let offset = 0; offset < 200; offset += 50) {
          const page = await deps.sdk.environments.list({
            offset,
            limit: 50,
            signal: controller.signal,
          });
          if (changed()) return importUnavailable("selection-changed");
          for (const env of page) {
            if (
              env.hostId === hostId &&
              env.path &&
              knownWorkspaces.length < 50
            )
              knownWorkspaces.push(env.path);
          }
          if (page.length < 50) break;
        }
      }
      if (changed()) return importUnavailable("selection-changed"); // Immediately before dispatch, including queued metadata work.
      const result = await deps.call(hostId, controller.signal, {
        hostId,
        command,
        knownWorkspaces,
      });
      if (changed()) return importUnavailable("selection-changed");
      const current = await deps.enrolled(hostId);
      if (changed()) return importUnavailable("selection-changed");
      if (!current || current.status !== "connected")
        return importUnavailable("host-offline");
      const parsed = importViewSchema.safeParse(result);
      return parsed.success ? parsed.data : importUnavailable("unsupported");
    } catch {
      return importUnavailable(changed() ? "selection-changed" : "unsupported");
    } finally {
      deps.activeReads.delete(controller);
      work.delete(controller);
    }
  };
}
