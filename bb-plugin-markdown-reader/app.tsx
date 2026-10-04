import { useCallback, useMemo } from "react";
import { definePluginApp, useRpc, type PluginFileOpenerProps } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import { Reader, type ReadDocument } from "./reader";
import "./app.css";

function FileReader({ path, source, Original, experimental_lineRange }: PluginFileOpenerProps) {
  const { kind, threadId, environmentId, projectId, experimental_hostId } = source;
  const target = useMemo(() => ({ path, source: { kind, threadId, environmentId, projectId,
    ...(experimental_hostId === undefined ? {} : { experimental_hostId }),
  } }), [path, kind, threadId, environmentId, projectId, experimental_hostId]);
  const rpc = useRpc<typeof rpcContract>();
  const readDocument = useCallback<ReadDocument>(target => rpc.call("read_document", target), [rpc]);
  const resolveDestinations = useCallback<import("./destination-view").ResolveDocumentDestinations>((target, requests) => rpc.call("resolve_destinations", { target, requests }), [rpc]);
  return <Reader key={JSON.stringify(target)} target={target} readDocument={readDocument} resolveDestinations={resolveDestinations} Original={Original} lineRange={experimental_lineRange} />;
}

export default definePluginApp(app => {
  app.slots.fileOpener({ id: "markdown-reader", title: "Markdown Reader", extensions: ["md", "markdown"], component: FileReader });
});
