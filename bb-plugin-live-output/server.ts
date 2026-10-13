import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { OutputCollector } from "./collector";
import { rpcContract } from "./contract";

export default function plugin(bb: BbPluginApi): void {
  const collector = new OutputCollector(() => bb.sdk.threads);
  bb.events.on("experimental_thread.events", ({ thread, sequence }) =>
    collector.observe(thread, sequence),
  );
  bb.events.on("thread.created", ({ thread }) => collector.observe(thread));
  bb.events.on("thread.archived", ({ thread }) => collector.observe(thread));
  bb.events.on("thread.unarchived", ({ thread }) => collector.observe(thread));
  bb.events.on("thread.deleted", ({ thread }) => collector.remove(thread.id));
  bb.rpc.register(rpcContract, { snapshot: () => collector.snapshot() });
  bb.background.service("observe-output", { start: (signal) => collector.run(signal) });
  bb.onDispose(() => collector.dispose());
}
