export function summarize(run) {
  if (run.mode !== "latency") throw new Error("Profile runs are not final latency evidence.");
  const groups = Object.fromEntries(["warm", "cold", "failed", "save-pending"].map((k) => [k, []]));
  for (const sample of run.samples) {
    if (!groups[sample.classification]) throw new Error("Unknown sample classification.");
    if (
      sample.status === "presented" &&
      (sample.rowKey !== sample.key || sample.detailKey !== sample.key)
    )
      throw new Error("Task identity mismatch.");
    if (
      !Number.isFinite(sample.latencyMs) ||
      sample.latencyMs < 0 ||
      !Number.isFinite(sample.blankMs) ||
      sample.blankMs < 0
    )
      throw new Error("Invalid sample timing.");
    groups[sample.classification].push(sample);
  }
  if (groups.warm.length < 30 || groups.warm.some((s) => s.status !== "presented"))
    throw new Error(
      "Need at least 30 warm movements and no failed warm samples. Preserve failures in the raw run.",
    );
  const values = groups.warm.map((s) => s.latencyMs).sort((a, b) => a - b);
  const n = values.length;
  return {
    warm: {
      count: n,
      medianMs: n % 2 ? values[(n - 1) / 2] : (values[n / 2 - 1] + values[n / 2]) / 2,
      p95Ms: values[Math.ceil(n * 0.95) - 1],
      worstMs: values[n - 1],
      blankMs: groups.warm.reduce((sum, s) => sum + s.blankMs, 0),
    },
    other: Object.fromEntries(
      Object.entries(groups)
        .filter(([k]) => k !== "warm")
        .map(([k, samples]) => [k, samples]),
    ),
    longTasks: run.longTasks ?? null,
    requests: run.requests ?? null,
    dateWork: "Measure in a separate profile run.",
    acceptance:
      "Timing summary only. Source, enabled plugins, trace and manual safety checks are separate gates.",
  };
}
