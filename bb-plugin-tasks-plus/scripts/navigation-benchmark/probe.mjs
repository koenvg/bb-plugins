// Browser-only measurement. This file does not change task, route, save or tab state.
export function readNativeTicket(document) {
  const visible = (element) =>
    Boolean(
      element &&
      !element.closest('[hidden],[inert],[aria-hidden="true"]') &&
      [...element.getClientRects()].some(
        (rect) =>
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.top < document.defaultView.innerHeight &&
          rect.left < document.defaultView.innerWidth,
      ),
    );
  const rows = [...document.querySelectorAll('[data-task-key][data-selected="true"]')];
  const details = [...document.querySelectorAll("[data-detail-key]")].filter(
    (el) => el.getClientRects().length,
  );
  const detail = details.length === 1 ? details[0] : null;
  const heading = detail?.querySelector('h1[aria-label="Task title"]');
  const description = detail?.querySelector('.bb-tasks-editor[data-variant="doc"] .tiptap');
  return {
    rowKey: rows.length === 1 ? rows[0].dataset.taskKey : null,
    detailKey: detail?.dataset.detailKey,
    heading: heading?.textContent,
    marker: description?.querySelector("h2")?.textContent,
    rendered: Boolean(
      description?.querySelector("p") &&
      description?.querySelector("ul") &&
      description?.querySelector("a"),
    ),
    visible: visible(heading) && visible(description),
  };
}
export function createProbe({
  window: win,
  read = () => readNativeTicket(win.document),
  mode = "latency",
  timeoutMs = 5000,
}) {
  if (!["latency", "profile"].includes(mode)) throw new Error("Unknown measurement mode.");
  if (win.innerWidth !== 1440 || win.innerHeight !== 900)
    throw new Error("Use a 1440x900 viewport.");
  const samples = [];
  const longTasks = [];
  const requests = [];
  let armed = null;
  let active = null;
  let disposed = false;
  let dateCalls = 0;
  let dateMs = 0;
  const originalDate = Date.prototype.toLocaleDateString;
  const observers = [];
  if (mode === "profile") {
    Date.prototype.toLocaleDateString = function (...args) {
      const start = win.performance.now();
      try {
        return originalDate.apply(this, args);
      } finally {
        dateCalls++;
        dateMs += win.performance.now() - start;
      }
    };
  }
  function collect(type, target) {
    if (!win.PerformanceObserver?.supportedEntryTypes.includes(type)) return false;
    const observer = new win.PerformanceObserver((list) =>
      target.push(
        ...list
          .getEntries()
          .map((e) => ({ name: e.name, startTime: e.startTime, duration: e.duration })),
      ),
    );
    observer.observe({ type });
    observers.push({ observer, target });
    return true;
  }
  const longTasksSupported = collect("longtask", longTasks);
  const resourcesSupported = collect("resource", requests);
  const match = (state, sample) =>
    state.rowKey === sample.key &&
    state.detailKey === sample.key &&
    state.heading === sample.title &&
    state.marker === sample.marker &&
    state.rendered &&
    state.visible;
  function finish(status, state, reason) {
    const end = win.performance.now();
    win.performance.mark?.(`bbp60-${samples.length}-end`);
    samples.push({
      ...active,
      status,
      reason,
      rowKey: state.rowKey,
      detailKey: state.detailKey,
      latencyMs: end - active.startTime,
      blankMs: active.blankMs,
      endTime: end,
    });
    active = null;
  }
  function frame() {
    if (disposed || !active) return;
    const now = win.performance.now();
    const state = read();
    if (
      win.innerWidth !== 1440 ||
      win.innerHeight !== 900 ||
      win.document?.visibilityState === "hidden"
    )
      return finish("failed", state, "Viewport or page visibility changed.");
    if (now - active.startTime > timeoutMs) return finish("failed", state, "Presentation timeout.");
    if (active.readyAt !== null) {
      // The previous frame could present the matching content. Recheck identity now.
      return finish(
        match(state, active) ? "presented" : "failed",
        state,
        match(state, active) ? null : "Identity changed before presentation.",
      );
    }
    if (match(state, active)) active.readyAt = now;
    if (!state.rendered || !state.visible) active.blankMs += now - active.lastFrame;
    active.lastFrame = now;
    win.requestAnimationFrame(frame);
  }
  function keydown(event) {
    if (!armed || disposed || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    if (
      event.repeat ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.target?.closest?.(
        'input,textarea,[contenteditable="true"],[role="dialog"],[role="menu"]',
      )
    )
      return;
    const state = read();
    if (state.rowKey !== armed.fromKey)
      throw new Error("Origin row does not match the armed movement.");
    const startTime = win.performance.now();
    active = {
      ...armed,
      arrow: event.key,
      startTime,
      lastFrame: startTime,
      readyAt: null,
      blankMs: 0,
    };
    win.performance.mark?.(`bbp60-${samples.length}-start`);
    armed = null;
    win.requestAnimationFrame(frame);
  }
  win.addEventListener("keydown", keydown, true);
  return {
    samples,
    arm(sample) {
      if (disposed || active || armed) throw new Error("Probe disposed or movement still pending.");
      if (
        !["warm", "cold", "failed", "save-pending"].includes(sample.classification) ||
        !sample.key ||
        !sample.fromKey ||
        !sample.title ||
        !sample.marker
      )
        throw new Error("Provide explicit classification and fixture identity.");
      armed = { ...sample };
    },
    export() {
      return {
        mode,
        viewport: [win.innerWidth, win.innerHeight],
        samples: [...samples],
        longTasks: longTasksSupported ? [...longTasks] : null,
        requests: resourcesSupported ? [...requests] : null,
        dateWork: mode === "profile" ? { calls: dateCalls, durationMs: dateMs } : null,
      };
    },
    dispose() {
      if (disposed) return;
      if (active) finish("failed", read(), "Probe disposed during movement.");
      disposed = true;
      armed = null;
      win.removeEventListener("keydown", keydown, true);
      for (const { observer, target } of observers) {
        target.push(
          ...observer
            .takeRecords()
            .map((e) => ({ name: e.name, startTime: e.startTime, duration: e.duration })),
        );
        observer.disconnect();
      }
      if (mode === "profile") Date.prototype.toLocaleDateString = originalDate;
    },
  };
}
