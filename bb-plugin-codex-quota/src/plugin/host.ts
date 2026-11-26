import { experimental_defineHostEntry } from "@get-bb/plugin-sdk";
import type { ExperimentalHostRpcHandlers } from "@get-bb/plugin-sdk";
import { hostContract, legacyQuotaView } from "../quota/contract.js";
import { fetchNormalizedQuota } from "../account/feasibility.js";
import { fetchNormalizedActivity } from "../activity/activity-fetch.js";
import { createAccount } from "../account/account.js";
import type { AccountDependencies } from "../account/account.js";
import { resolvePiAuth } from "../account/pi-auth.js";
import { createHostHistory } from "../history/history-host.js";
import type { HostHistory } from "../history/history-host.js";
import { importUnavailable } from "../history/import/import-contract.js";

// Packaged checks exercise the real SQLite adapter and exact collector asset.
export { openHistoryDatabase } from "../history/storage/history-storage.js";
export { packagedCollectorAsset } from "../history/collection/collector-compatibility.js";
export { upgradeRetainedIdentityStorage } from "../history/storage/identity-storage-upgrade.js";

type Dependencies = AccountDependencies & { history?: HostHistory };

export function createQuotaHostEntry(deps: Dependencies) {
  const account = createAccount(deps);
  const history = deps.history ?? createHostHistory();
  const observe: ExperimentalHostRpcHandlers<typeof hostContract>["accountObservationV2"] = (
    { challenge, refresh, includeActivity },
    context,
  ) =>
    account.observation(
      challenge,
      refresh,
      includeActivity,
      AbortSignal.any([context.signal, context.lifecycle.signal]),
    );
  return experimental_defineHostEntry({
    contract: hostContract,
    dispose: () => {
      account.dispose();
      history.dispose();
    },
    handlers: {
      ping: async () => ({ reachable: true }),
      accountObservation: async (input, context) => {
        const observation = await observe(input, context);
        return { ...observation, quota: legacyQuotaView(observation.quota) };
      },
      accountObservationV2: observe,
      calendarReport: (calendar, context) =>
        history.report(calendar, {
          dataDir: context.experimental_paths.dataDir,
          signal: AbortSignal.any([context.signal, context.lifecycle.signal]),
        }),
      historicalImport: async ({ hostId, command, knownWorkspaces }, context) => {
        const signal = AbortSignal.any([context.signal, context.lifecycle.signal]);
        if (signal.aborted || !history.controlImport) {
          return importUnavailable(signal.aborted ? "selection-changed" : "unsupported");
        }
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
      reportPreparation: async ({ identities }, context) =>
        history.prepare
          ? history.prepare({
              dataDir: context.experimental_paths.dataDir,
              identities,
              signal: AbortSignal.any([context.signal, context.lifecycle.signal]),
            })
          : { state: "unavailable" as const, reason: "unsupported" as const },
      historyReadiness: async (input, context) =>
        history.read({
          dataDir: context.experimental_paths.dataDir,
          identities: input?.identities,
          signal: AbortSignal.any([context.signal, context.lifecycle.signal]),
        }),
      collectorMaintenance: (_input, context) =>
        history.repairExisting({
          dataDir: context.experimental_paths.dataDir,
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
      quota: async ({ refresh }, context) =>
        legacyQuotaView(
          await account.quota(
            refresh === true,
            AbortSignal.any([context.signal, context.lifecycle.signal]),
          ),
        ),
    },
  });
}

export default createQuotaHostEntry({
  auth: resolvePiAuth,
  read: fetchNormalizedQuota,
  activityRead: fetchNormalizedActivity,
});
