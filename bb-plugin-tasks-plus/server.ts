import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

import { createStore, registerTasksApi } from "./api";
import { registerAttachments } from "./attachments";
import { registerTasksCli } from "./cli";
import { registerDelegation } from "./delegate";
import { registerLifecycle } from "./lifecycle";
import { registerMentions } from "./mentions";
import { registerOrchestrationStatus } from "./orchestration";

import { createRunController } from "./orchestration/run";
import { createDispatcher } from "./orchestration/dispatch";
import { createReporter, type ReporterOptions } from "./orchestration/report";
import { withReportCoordination } from "./orchestration/report-coordination";
const TASKS_PLUGIN_NAME = "Tasks";
export const TASKS_PLUGIN_VERSION = "0.1.2";

const tasksRpcContract = defineRpcContract({
  ping: {
    input: z.null(),
    output: z.object({ ok: z.literal(true), version: z.string() }),
  },
});

function statusPayload() {
  return { name: TASKS_PLUGIN_NAME, version: TASKS_PLUGIN_VERSION };
}

export default async function plugin(bb: BbPluginApi) {
  return registerTasks(bb);
}

/** Production enables only the previously verified Pi native-origin storage path. Tests can select other isolated origins; no option enables agent delivery. */
export async function registerTasks(
  bb: BbPluginApi,
  reportOptions: ReporterOptions = { nativeProviders: ["pi"] },
) {
  bb.log.info(`${TASKS_PLUGIN_NAME} ${TASKS_PLUGIN_VERSION} loaded`);

  const store = createStore(bb);
  registerTasksApi(bb, store);
  registerAttachments(bb, store.tasks);
  const runs = createRunController(bb, store);
  runs.register();
  const reporter = createReporter(bb, store, runs, reportOptions);
  reporter.register();
  const dispatcher = createDispatcher(bb, store, runs);
  dispatcher.register();
  const orchestrationOptions = {
    readCoordination: withReportCoordination(
      dispatcher.readCoordination,
      reporter.reports,
    ),
  };
  registerTasksCli(
    bb,
    store,
    statusPayload(),
    orchestrationOptions,
    runs,
    dispatcher,
    reporter,
  );
  registerDelegation(bb, store);
  registerOrchestrationStatus(bb, store, orchestrationOptions);
  registerMentions(bb, store);
  await registerLifecycle(bb, store);

  bb.rpc.register(tasksRpcContract, {
    ping(): { ok: true; version: string } {
      return { ok: true, version: TASKS_PLUGIN_VERSION };
    },
  });
}
