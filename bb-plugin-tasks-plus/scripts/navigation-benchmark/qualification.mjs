// Measurement evidence only. No application cache, task mutation or synthetic signal.
export function createWarmthLedger({ now, expectedRevisions }) {
  let epoch = 0;
  let nextRead = 0;
  const entries = new Map();
  const reads = [],
    invalidations = [],
    mutations = [],
    errors = [];
  const messageTypes = {};
  function invalidate(reason, channel = null) {
    invalidations.push({ epoch: ++epoch, time: now(), reason, channel });
  }
  function inspect(key) {
    const entry = entries.get(key);
    const current = Boolean(
      entry && entry.epoch === epoch && entry.revision === expectedRevisions[key],
    );
    return {
      key,
      epoch,
      previsited: Boolean(entry),
      current,
      revision: entry?.revision ?? null,
      classification: current ? "warm" : "cold",
    };
  }
  return {
    invalidate,
    inspect,
    beginRead(key) {
      return { id: ++nextRead, key, epoch, startTime: now() };
    },
    confirm(token, revision) {
      const accepted = token.epoch === epoch && revision === expectedRevisions[token.key];
      reads.push({ ...token, revision, endTime: now(), accepted });
      if (revision !== expectedRevisions[token.key])
        errors.push({
          key: token.key,
          expected: expectedRevisions[token.key],
          actual: revision,
          reason: "Dataset revision changed.",
        });
      // A stale completion is recorded, but cannot replace a newer current entry.
      const previous = entries.get(token.key);
      if (!previous || token.id >= previous.id)
        entries.set(token.key, { id: token.id, epoch: accepted ? epoch : -1, revision });
    },
    failedRead(token, reason) {
      reads.push({ ...token, endTime: now(), accepted: false, reason });
    },
    mutation(method) {
      mutations.push({ method, time: now() });
      invalidate("mutation-attempt");
    },
    coverageError(reason) {
      errors.push({ reason, time: now() });
      invalidate("coverage-error");
    },
    message(message) {
      const type = String(message?.type ?? "unknown");
      messageTypes[type] = (messageTypes[type] ?? 0) + 1;
      if (
        message?.type === "plugin-signal" &&
        message.pluginId === "tasks-plus" &&
        ["tasks:changed", "projects:changed", "comments:changed", "threads:changed"].includes(
          message.channel,
        )
      ) {
        invalidate("plugin-signal", message.channel);
      }
    },
    qualify(before) {
      const after = inspect(before.key);
      const invalidatedDuringMovement = before.epoch !== epoch;
      return {
        ...before,
        currentAtEnd: after.current,
        epochAtEnd: epoch,
        invalidatedDuringMovement,
        classification:
          before.current && !invalidatedDuringMovement && after.current ? "warm" : "cold",
      };
    },
    export() {
      return {
        epoch,
        entries: Object.fromEntries([...entries].map(([key]) => [key, inspect(key)])),
        reads: [...reads],
        invalidations: [...invalidations],
        mutations: [...mutations],
        errors: [...errors],
        messageTypes: { ...messageTypes },
      };
    },
  };
}

export function installQualificationObservers(win, expectedRevisions) {
  const ledger = createWarmthLedger({ now: () => win.performance.now(), expectedRevisions });
  const OriginalSocket = win.WebSocket;
  const originalFetch = win.fetch;
  const pending = new Set();
  const cleanup = [];
  let disposed = false;
  let sockets = 0;
  function listen(target, name, callback) {
    target.addEventListener(name, callback, true);
    cleanup.push(() => target.removeEventListener?.(name, callback, true));
  }
  class ObservedSocket extends OriginalSocket {
    constructor(...args) {
      super(...args);
      sockets++;
      for (const name of ["open", "close", "error"])
        listen(this, name, () => {
          if (!disposed) ledger.invalidate("connection-" + name);
        });
      listen(this, "message", (event) => {
        if (disposed) return;
        try {
          ledger.message(JSON.parse(event.data));
        } catch {
          ledger.coverageError("Unparsed WebSocket frame.");
        }
      });
    }
  }
  const observedFetch = async function (input, options) {
    const url = typeof input === "string" ? input : input.url;
    const method = url?.split("/api/v1/plugins/tasks-plus/rpc/")[1]?.split("?")[0];
    let token = null;
    if (method === "getTaskByKey") {
      try {
        const key = JSON.parse(options?.body).taskKey;
        if (Object.hasOwn(expectedRevisions, key)) token = ledger.beginRead(key);
      } catch {
        ledger.coverageError("Unparsed task lookup input.");
      }
    } else if (method && !/^(get|list|sidebar)/.test(method)) ledger.mutation(method);
    let response;
    try {
      response = await originalFetch.call(this, input, options);
    } catch (error) {
      if (token && !disposed) ledger.failedRead(token, "Fetch rejected.");
      throw error;
    }
    if (token && !disposed) {
      const work = response
        .clone()
        .json()
        .then((body) => {
          if (disposed) return;
          if (response.ok && body.ok === true && body.result?.task?.key === token.key)
            ledger.confirm(token, body.result.task.updatedAt);
          else ledger.failedRead(token, "Lookup did not confirm this task.");
        })
        .catch(() => {
          if (!disposed) ledger.coverageError("Unparsed lookup response.");
        });
      pending.add(work);
      void work.finally(() => pending.delete(work));
    }
    return response;
  };
  win.WebSocket = ObservedSocket;
  win.fetch = observedFetch;
  listen(win, "offline", () => ledger.invalidate("offline"));
  listen(win, "online", () => ledger.invalidate("online"));
  listen(win, "pagehide", () => ledger.invalidate("pagehide"));
  listen(win.document, "click", (event) => {
    if (event.target?.closest?.('[aria-label="Refresh tasks"]'))
      ledger.invalidate("manual-refresh");
  });
  listen(win, "keydown", (event) => {
    if (
      event.key?.toLowerCase() === "r" &&
      !event.target?.closest?.('input,textarea,[contenteditable="true"]')
    )
      ledger.invalidate("possible-refresh-shortcut");
  });
  return {
    ledger,
    settle: () => Promise.all(pending),
    sockets: () => sockets,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const remove of cleanup) remove();
      if (win.fetch === observedFetch) win.fetch = originalFetch;
      if (win.WebSocket === ObservedSocket) win.WebSocket = OriginalSocket;
    },
  };
}
