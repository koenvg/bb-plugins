import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { createSourceReader, readResultSchema, targetSchema, destinationsInputSchema, destinationsResultSchema } from "./source";

export const rpcContract = defineRpcContract({
  read_document: { input: targetSchema, output: readResultSchema },
  resolve_destinations: { input: destinationsInputSchema, output: destinationsResultSchema },
});

export default function plugin(bb: BbPluginApi) {
  const reader = createSourceReader({
    environment: environmentId => bb.sdk.environments.get({ environmentId }),
    project: projectId => bb.sdk.projects.get({ projectId }),
    thread: threadId => bb.sdk.threads.get({ threadId }),
    storageLocation: threadId => bb.sdk.threads.storageLocation({ threadId }),
    read: target => bb.sdk.files.read(target),
    createPreview: target => bb.sdk.files.createPreview(target),
  });
  bb.rpc.register(rpcContract, { read_document: target => reader.read(target), resolve_destinations: input => reader.destinations(input) });
}
