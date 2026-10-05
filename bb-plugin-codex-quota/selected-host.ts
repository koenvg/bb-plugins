import type { z } from "zod";

export type HostSelection = { hostId: string | null; generation: number };
export type HostRequest = { hostId: string; generation: number };
type Failure =
  | "no-selection"
  | "foreign-host"
  | "selection-changed"
  | "host-offline"
  | "unsupported";
type RequestOptions<T> = {
  schema: z.ZodType<T>;
  unavailable(reason: Failure): T;
  call(signal: AbortSignal): Promise<unknown>;
  errorReason?: "host-offline" | "unsupported";
  timeoutMs?: number;
  signal?: AbortSignal;
};

/** One owner for selected-host privacy checks and request cancellation. */
export function createSelectedHost(deps: {
  enrolled(hostId: string): Promise<{ status: string } | null>;
}) {
  let selected: HostSelection = { hostId: null, generation: 0 };
  let selectionRequest = 0;
  const lifecycle = new AbortController();
  const active = new Set<AbortController>();
  const selection = () => ({ ...selected });
  const abortReads = () => {
    for (const controller of active) controller.abort();
  };
  const reject = (input: HostRequest): Failure | null => {
    if (lifecycle.signal.aborted) return "selection-changed";
    if (!selected.hostId) return "no-selection";
    if (input.generation !== selected.generation) return "selection-changed";
    return input.hostId !== selected.hostId ? "foreign-host" : null;
  };
  return {
    selection,
    async select(hostId: string | null): Promise<HostSelection> {
      const request = ++selectionRequest;
      if (lifecycle.signal.aborted) return selection();
      try {
        if (hostId !== null && !(await cancellable(() => deps.enrolled(hostId), lifecycle.signal)))
          return selection();
      } catch {
        return selection();
      }
      if (lifecycle.signal.aborted || request !== selectionRequest) return selection();
      if (selected.hostId !== hostId) {
        selected = { hostId, generation: selected.generation + 1 };
        abortReads();
      }
      return selection();
    },
    async request<T>(input: HostRequest, options: RequestOptions<T>): Promise<T> {
      const failure = reject(input);
      if (failure) return options.unavailable(failure);
      const controller = new AbortController();
      const signal = AbortSignal.any([
        controller.signal,
        lifecycle.signal,
        ...(options.signal ? [options.signal] : []),
        ...(options.timeoutMs ? [AbortSignal.timeout(options.timeoutMs)] : []),
      ]);
      const changed = () =>
        signal.aborted ||
        selected.hostId !== input.hostId ||
        selected.generation !== input.generation;
      active.add(controller);
      try {
        const host = await cancellable(() => deps.enrolled(input.hostId), signal);
        if (changed()) return options.unavailable("selection-changed");
        if (!host || host.status !== "connected") return options.unavailable("host-offline");
        const result = await cancellable(() => options.call(signal), signal);
        if (changed()) return options.unavailable("selection-changed");
        const current = await cancellable(() => deps.enrolled(input.hostId), signal);
        if (changed()) return options.unavailable("selection-changed");
        if (!current || current.status !== "connected") return options.unavailable("host-offline");
        const parsed = options.schema.safeParse(result);
        return parsed.success ? parsed.data : options.unavailable("unsupported");
      } catch {
        return options.unavailable(
          changed() ? "selection-changed" : (options.errorReason ?? "unsupported"),
        );
      } finally {
        active.delete(controller);
      }
    },
    dispose() {
      lifecycle.abort();
      abortReads();
    },
  };
}
export type SelectedHost = ReturnType<typeof createSelectedHost>;

/** Stop waiting without requiring the transport to honor its signal. */
function cancellable<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve()
      .then(() => {
        signal.throwIfAborted();
        return work();
      })
      .then(
        (value) => {
          signal.removeEventListener("abort", abort);
          resolve(value);
        },
        (error) => {
          signal.removeEventListener("abort", abort);
          reject(error);
        },
      );
  });
}
