import { Icon } from "@/components/ui/icon";
import type { TaskDurationResult } from "../../shared/task-duration.js";

function formatDuration(milliseconds: number) {
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 1) return { compact: "<1m", accessible: "Less than one minute" };
  const units = [
    { value: Math.floor(minutes / 1440), short: "d", name: "day" },
    { value: Math.floor((minutes % 1440) / 60), short: "h", name: "hour" },
    { value: minutes % 60, short: "m", name: "minute" },
  ]
    .filter(({ value }) => value > 0)
    .slice(0, 2);
  return {
    compact: units.map(({ value, short }) => `${value}${short}`).join(" "),
    accessible: units
      .map(({ value, name }) => `${value} ${name}${value === 1 ? "" : "s"}`)
      .join(" "),
  };
}

const unavailableReasons = {
  "missing-start": "No recorded first start in status history.",
  "missing-completion": "Status history is missing the final completion.",
  "invalid-timestamp": "Status history has invalid or out-of-order timestamps.",
};

function durationDisplay(duration: TaskDurationResult): {
  value: { compact: string; accessible?: string };
  interrupted?: boolean;
  explanation: string;
} {
  switch (duration.kind) {
    case "completed":
      return {
        value: formatDuration(duration.milliseconds),
        interrupted: duration.interrupted,
        explanation: duration.interrupted
          ? "Returned to todo or backlog after starting. Excluded from median and average."
          : "First start to last done. Includes review time and the reopened period.",
      };
    case "unfinished":
      return {
        value: { compact: "Not completed" },
        interrupted: duration.interrupted,
        explanation: "Shown when the task is done. No live timer.",
      };
    case "excluded":
      return {
        value: { compact: "Excluded" },
        interrupted: duration.interrupted,
        explanation: "Canceled tasks have no duration and are excluded from median and average.",
      };
    case "unavailable":
      return {
        value: { compact: "Duration unavailable" },
        interrupted: duration.interrupted,
        explanation: unavailableReasons[duration.reason],
      };
  }
}

export function TaskDurationStrip({
  duration,
  pendingStatus,
}: {
  duration: TaskDurationResult;
  pendingStatus: boolean;
}) {
  const display = pendingStatus
    ? {
        value: { compact: "Awaiting status save" },
        explanation: "Duration updates after the status is saved.",
      }
    : durationDisplay(duration);
  return (
    <section
      aria-label="Task duration"
      className="mb-5 min-h-28 border-y border-border py-4 sm:min-h-24"
    >
      <div className="flex items-start gap-3">
        <Icon name="Clock" aria-hidden className="mt-1 size-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <div className="flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-xs text-muted-foreground">Duration</span>
            <strong
              className="text-base font-bold tabular-nums"
              aria-label={display.value.accessible}
            >
              {display.value.compact}
            </strong>
            {display.interrupted && (
              <span className="rounded-sm bg-warning/10 px-1.5 py-0.5 text-xs font-medium text-warning">
                Interrupted
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{display.explanation}</p>
        </div>
      </div>
    </section>
  );
}
