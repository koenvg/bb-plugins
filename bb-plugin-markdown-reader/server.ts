import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { createSourceReader, readResultSchema, targetSchema } from "./source";

export const rpcContract = defineRpcContract({
  read_document: { input: targetSchema, output: readResultSchema },
});

export default function plugin(bb: BbPluginApi) {
  const reader = createSourceReader({
    environment: environmentId => bb.sdk.environments.get({ environmentId }),
    project: projectId => bb.sdk.projects.get({ projectId }),
    thread: threadId => bb.sdk.threads.get({ threadId }),
    read: target => bb.sdk.files.read(target),
  });
  bb.rpc.register(rpcContract, { read_document: target => reader.read(target) });
}
