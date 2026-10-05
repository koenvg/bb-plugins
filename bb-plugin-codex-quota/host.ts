import { experimental_defineHostEntry } from "@get-bb/plugin-sdk";
import { hostContract } from "./contract.js";
import { fetchNormalizedQuota } from "./feasibility.js";
import { fetchNormalizedActivity } from "./activity-fetch.js";
import { createAccount, type AccountDependencies } from "./account.js";
import { resolvePiAuth } from "./pi-auth.js";
import { createHostHistory, type HostHistory } from "./history-host.js";
import { importUnavailable } from "./import-contract.js";

// Packaged checks exercise the real SQLite adapter and exact collector asset.
export { openHistoryDatabase } from "./history-storage.js";
export { packagedCollectorAsset } from "./collector-compatibility.js";

type Dependencies = AccountDependencies & { history?: HostHistory };

export function createQuotaHostEntry(deps: Dependencies) {
  const account = createAccount(deps);
  const history = deps.history ?? createHostHistory();
  return experimental_defineHostEntry({
    contract: hostContract,
    dispose: () => {
      account.dispose();
      history.dispose();
    },
    handlers: {
      ping: async () => ({ reachable: true }),
      calendarReport: (calendar, context) =>
        history.report(calendar, {
          dataDir: context.experimental_paths.dataDir,
          signal: AbortSignal.any([context.signal, context.lifecycle.signal]),
        }),
      historicalImport: async ({ hostId, command, knownWorkspaces }, context) => {
        const signal = AbortSignal.any([context.signal, context.lifecycle.signal]);
        if (signal.aborted || !history.controlImport)
          return importUnavailable(signal.aborted ? "selection-changed" : "unsupported");
        const lease =
          command.action === "start" || command.action === "resume"
            ? context.experimental_retainWorker()
            : null;
        try {
          signal.throwIfAborted();
          return await history.controlImport(command, {
            hostId,
            knownWorkspaces,
            dataDir: context.experimental_paths.dataDir,
            signal,
          });
        } finally {
          await lease?.dispose();
        }
      },
      historyReadiness: async (input, context) =>
        history.read({
          dataDir: context.experimental_paths.dataDir,
          identities: input?.identities,
          signal: AbortSignal.any([context.signal, context.lifecycle.signal]),
        }),
      collectorControl: async ({ action, confirmation }, context) =>
        history.control(
          action,
          {
            dataDir: context.experimental_paths.dataDir,
            signal: AbortSignal.any([context.signal, context.lifecycle.signal]),
          },
          confirmation,
        ),
      activity: ({ refresh }, context) =>
        account.activity(
          refresh === true,
          AbortSignal.any([context.signal, context.lifecycle.signal]),
        ),
      quota: ({ refresh }, context) =>
        account.quota(
          refresh === true,
          AbortSignal.any([context.signal, context.lifecycle.signal]),
        ),
    },
  });
}

export default createQuotaHostEntry({
  auth: resolvePiAuth,
  read: fetchNormalizedQuota,
  activityRead: fetchNormalizedActivity,
});
