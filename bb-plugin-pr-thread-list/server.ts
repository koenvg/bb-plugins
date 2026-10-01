import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { rpcContract } from "./contract";
import { listSummaries } from "./summaries";

export type { rpcContract } from "./contract";

export default function plugin(bb: BbPluginApi): void {
  bb.rpc.register(rpcContract, { listSummaries: () => listSummaries(bb.sdk) });
}
