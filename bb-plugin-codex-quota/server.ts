import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { hostContract, quotaViewSchema } from "./contract.js";

const hostIdSchema = z.string().min(1).max(128);
const generationSchema = z.number().int().min(0).max(1_000_000_000);
const selectionSchema = z.object({ hostId: hostIdSchema.nullable(), generation: generationSchema }).strict();

export const rpcContract = defineRpcContract({
  ping: { input: z.object({ hostId: hostIdSchema }).strict(), output: z.object({ reachable: z.boolean() }).strict() },
  selection: { input: z.null(), output: selectionSchema },
  selectHost: { input: z.object({ hostId: hostIdSchema.nullable() }).strict(), output: selectionSchema },
  read: { input: z.object({ hostId: hostIdSchema, generation: generationSchema, refresh: z.boolean().optional() }).strict(), output: quotaViewSchema },
});

const unavailable = (reason: "no-selection" | "foreign-host" | "selection-changed" | "host-offline" | "unsupported") =>
  ({ state: "unavailable" as const, reason, snapshot: null });

export default function plugin(bb: BbPluginApi) {
  const hostClient = bb.hosts.experimental_client({ contract: hostContract });
  let selectedHostId: string | null = null;
  let generation = 0;
  let selectionRequest = 0;
  const activeReads = new Set<AbortController>();
  const selection = () => ({ hostId: selectedHostId, generation });
  const enrolled = async (hostId: string) => {
    const host = await bb.sdk.hosts.get({ hostId });
    return host.id === hostId && host.type === "persistent" && host.lifecycle.phase === "active" ? host : null;
  };
  bb.rpc.register(rpcContract, {
    async selection() { return selection(); },
    async selectHost({ hostId }) {
      const request = ++selectionRequest;
      if (hostId !== null) {
        try { if (!await enrolled(hostId)) return selection(); } catch { return selection(); }
      }
      if (request !== selectionRequest) return selection();
      if (selectedHostId !== hostId) {
        selectedHostId = hostId;
        generation++;
        for (const controller of activeReads) controller.abort();
      }
      return selection();
    },
    async read({ hostId, generation: requestedGeneration, refresh }) {
      if (selectedHostId === null) return unavailable("no-selection");
      if (requestedGeneration !== generation) return unavailable("selection-changed");
      if (hostId !== selectedHostId) return unavailable("foreign-host");
      const controller = new AbortController();
      activeReads.add(controller);
      try {
        const host = await enrolled(hostId);
        if (controller.signal.aborted || requestedGeneration !== generation || hostId !== selectedHostId) return unavailable("selection-changed");
        if (!host || host.status !== "connected") return unavailable("host-offline");
        const result = await hostClient.call("quota", { refresh: refresh === true }, { hostId, signal: controller.signal });
        if (requestedGeneration !== generation || hostId !== selectedHostId) return unavailable("selection-changed");
        const current = await enrolled(hostId);
        if (requestedGeneration !== generation || hostId !== selectedHostId) return unavailable("selection-changed");
        if (!current || current.status !== "connected") return unavailable("host-offline");
        const parsed = quotaViewSchema.safeParse(result);
        return parsed.success ? parsed.data : unavailable("unsupported");
      } catch {
        return requestedGeneration !== generation || hostId !== selectedHostId ?
          unavailable("selection-changed") : unavailable("host-offline");
      } finally {
        activeReads.delete(controller);
      }
    },
    async ping({ hostId }) {
      try {
        const host = await bb.sdk.hosts.get({ hostId });
        if (host.id !== hostId) return { reachable: false };
        return await hostClient.call("ping", null, { hostId });
      } catch { return { reachable: false }; }
    },
  });
}
