import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { TasksApiStore } from "../api";
import {
  orchestrationStatusContract,
  type CoordinationReader,
} from "./status-contract";
import { readEpicStatus } from "./status";

export interface StatusOptions {
  readCoordination?: CoordinationReader;
}
export function registerOrchestrationStatus(
  bb: BbPluginApi,
  store: TasksApiStore,
  options: StatusOptions = {},
): void {
  bb.rpc.register(orchestrationStatusContract, {
    orchestrateStatus: ({ epicId }) =>
      readEpicStatus(bb, store, epicId, options.readCoordination),
  });
}
