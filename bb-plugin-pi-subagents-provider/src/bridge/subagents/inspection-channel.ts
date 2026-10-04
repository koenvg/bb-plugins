import { boundedValue } from "../../subagents-contract.js";
import { type CaptureTarget } from "./capture.js";
export const INSPECTION_PREFIX = "PI_SUBAGENT_INSPECT_JSON:";
export function createInspectionChannel(options: {
  context(): Promise<unknown>; command(message: string): Promise<unknown>; current(): boolean;
}) {
  let closed = false;
  let active = false;
  let pending: { requestId: string; resolve(value: unknown): void; reject(error: Error): void } | undefined;
  function contextMatches(raw: unknown, target: CaptureTarget) {
    if (!boundedValue(raw, 16 * 1024)) return false;
    const c = raw as { sessionId?: unknown; sessionFile?: unknown; guard?: unknown; command?: unknown };
    return c?.sessionId === target.sessionId && c.sessionFile === target.sessionFile && c.guard === true && c.command === true;
  }
  return {
    async inspect(target: CaptureTarget, requestId: string): Promise<unknown> {
      if (closed || active || !options.current()) throw new Error("Inspection session unavailable");
      active = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(requestId) || !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,159}$/.test(target.asyncId) || target.childId !== undefined && !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,159}$/.test(target.childId)) throw new Error("Invalid inspection identity");
        if (!contextMatches(await options.context(),target)) throw new Error("Inspection command capability unavailable or foreign session");
        if (closed || !options.current()) throw new Error("Inspection session replaced");
        const reply = new Promise<unknown>((resolve,reject) => { pending = { requestId, resolve, reject }; timer = setTimeout(() => reject(new Error("Inspection widget timed out")), 2500); timer.unref?.(); });
        void reply.catch(() => {});
        const response = await options.command(`/subagents-inspect-rpc ${requestId} ${target.asyncId}${target.childId ? " " + target.childId : ""} --lines 20`);
        if ((response as { disposition?: unknown })?.disposition !== "handled") throw new Error("Inspection command was not confirmed handled");
        const value = await reply;
        if (closed || !options.current() || !contextMatches(await options.context(),target)) throw new Error("Inspection session replaced during capture");
        return value;
      } finally { clearTimeout(timer); pending = undefined; active = false; }
    },
    widget(request: Record<string,unknown>): boolean {
      if (request.method !== "setWidget" || request.widgetKey !== "subagent-inspect") return false;
      if (!pending || closed) return true;
      const lines = request.lines;
      if (!Array.isArray(lines) || lines.length !== 1 || typeof lines[0] !== "string" || !lines[0].startsWith(INSPECTION_PREFIX) || Buffer.byteLength(lines[0],"utf8") > 64 * 1024 + INSPECTION_PREFIX.length) return true;
      try { const value = JSON.parse(lines[0].slice(INSPECTION_PREFIX.length)); if (value?.requestId === pending.requestId) pending.resolve(value); } catch { /* Invalid data cannot supply capture evidence. */ }
      return true;
    },
    dispose() { closed = true; pending?.reject(new Error("Inspection session disposed")); pending = undefined; },
  };
}
