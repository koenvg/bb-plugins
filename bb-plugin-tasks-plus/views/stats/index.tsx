import { useId, useState } from "react";
import type { StatsDurationRow, StatsMeasures, TaskStats } from "../../shared/contract.js";
import { useProjects, useTasksQuery } from "../../shell/data.js";
import { useTasksNavigation } from "../../shell/routes.js";
import { PRIORITY_LABELS } from "../list/lib.js";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "../../components/empty-state.js";
import "./stats.css";

export function formatStatsDuration(milliseconds: number | null): string {
  if (milliseconds === null) return "No data";
  if (milliseconds === 0) return "0s";
  if (milliseconds < 1000) return "<1s";
  const seconds = milliseconds / 1000;
  const rounded = (value: number) => Number(value.toFixed(1)).toString();
  if (seconds < 60) return `${rounded(seconds)}s`;
  if (seconds < 3600) return `${rounded(seconds / 60)}m`;
  const hours = seconds / 3600;
  if (hours < 24) return `${rounded(hours)}h`;
  const days = Math.floor(hours / 24);
  const remainder = Number((hours % 24).toFixed(1));
  return remainder ? `${days}d ${remainder}h` : `${days}d`;
}

function Summary({ measures }: { measures: StatsMeasures | undefined }) {
  const items = [
    {
      label: "Median duration",
      value: measures ? formatStatsDuration(measures.medianMs) : null,
      description: "The middle completed task",
    },
    {
      label: "Average duration",
      value: measures ? formatStatsDuration(measures.averageMs) : null,
      description: "Elapsed time per completed task",
    },
    {
      label: "Tasks counted",
      value: measures?.count.toString() ?? null,
      description: "Completed tasks without interruptions",
    },
  ];
  return (
    <dl className="stats-summary" aria-label="Duration summary">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value ?? <span className="stats-placeholder" aria-hidden />}</dd>
          <p>{item.description}</p>
        </div>
      ))}
    </dl>
  );
}

function MeasuresTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<StatsMeasures & { id: string; name: string; color?: string }>;
}) {
  return (
    <section className="stats-breakdown">
      <h2>{title}</h2>
      <table>
        <caption className="sr-only">{title} duration statistics</caption>
        <thead>
          <tr>
            <th scope="col">{title === "By project" ? "Project" : "Priority"}</th>
            <th scope="col">Tasks</th>
            <th scope="col">Median</th>
            <th scope="col">Average</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">
                <span className="stats-table-name">
                  {row.color ? (
                    <span
                      aria-hidden
                      className="stats-project-dot"
                      style={{ backgroundColor: row.color }}
                    />
                  ) : null}
                  <span>{row.name}</span>
                </span>
              </th>
              <td>{row.count}</td>
              <td>{formatStatsDuration(row.medianMs)}</td>
              <td>{formatStatsDuration(row.averageMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function TaskRows({
  rows,
  stats,
  interrupted = false,
}: {
  rows: StatsDurationRow[];
  stats: TaskStats;
  interrupted?: boolean;
}) {
  const navigation = useTasksNavigation();
  const projectNames = new Map(stats.byProject.map((project) => [project.id, project.name]));
  return (
    <ul className="stats-task-list">
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            aria-label={`Open ${row.key}: ${row.title}`}
            onClick={() => navigation.go({ kind: "task", taskKey: row.key })}
          >
            <Icon
              name="Check"
              className={interrupted ? "size-4 text-warning" : "size-4 text-success"}
            />
            <span className="stats-task-key">{row.key}</span>
            <span className="stats-task-copy">
              <span>{row.title}</span>
              <small>
                {projectNames.get(row.projectId)} · {PRIORITY_LABELS[row.priority]}
              </small>
            </span>
            <span className="stats-task-duration">
              {formatStatsDuration(row.milliseconds)}
              {interrupted ? <small className="text-warning">Interrupted</small> : null}
            </span>
            <Icon name="ChevronRight" className="size-4 text-muted-foreground" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function StatsView({ projectId }: { projectId?: string }) {
  const navigation = useTasksNavigation();
  const projects = useProjects();
  const filterId = useId();
  const interruptedId = useId();
  const [showInterrupted, setShowInterrupted] = useState(false);
  const query = useTasksQuery(
    async (rpc) => ({
      projectId,
      stats: await rpc.call("getTaskStats", {
        ...(projectId ? { projectId } : {}),
        includeInterrupted: showInterrupted,
      }),
    }),
    ["tasks:changed", "projects:changed"],
    [projectId, showInterrupted],
  );
  const stats = query.data?.projectId === projectId ? query.data?.stats : undefined;
  const hasProject = projects.data?.some((project) => project.id === projectId);

  return (
    <div className="task-stats">
      <div className="stats-heading">
        <h1>How long tasks take</h1>
        <div className="stats-filter">
          <label htmlFor={filterId}>Project</label>
          <Select
            value={projectId ?? "all"}
            onValueChange={(value) =>
              navigation.go({ kind: "stats", ...(value === "all" ? {} : { projectId: value }) })
            }
          >
            <SelectTrigger id={filterId} aria-label="Project">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projectId && !hasProject ? (
                <SelectItem value={projectId}>Project unavailable</SelectItem>
              ) : null}
              {(projects.data ?? []).map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {projects.error ? (
            <Button variant="ghost" size="sm" onClick={projects.refresh}>
              Retry projects
            </Button>
          ) : null}
        </div>
      </div>
      <div className="stats-content" aria-busy={query.isLoading}>
        <Summary measures={stats?.summary} />
        {query.error ? (
          <div role="alert" className="stats-state">
            <EmptyState
              icon="Clock"
              title="Could not load stats"
              description={query.error}
              action={
                <Button size="sm" onClick={query.refresh}>
                  Retry
                </Button>
              }
            />
          </div>
        ) : !stats ? (
          <div role="status" className="stats-state stats-loading">
            Loading stats…
          </div>
        ) : (
          <>
            {stats.summary.count > 0 && stats.summary.count < 5 ? (
              <p className="stats-small-sample">
                Only {stats.summary.count} {stats.summary.count === 1 ? "task" : "tasks"} so far.
                Treat these numbers as an early indication.
              </p>
            ) : null}
            {stats.interrupted.count > 0 ? (
              <>
                <div className="stats-interruption">
                  <div>
                    <p>
                      {stats.interrupted.count} interrupted{" "}
                      {stats.interrupted.count === 1 ? "task" : "tasks"} excluded
                    </p>
                    <p>
                      These returned to todo or backlog after starting. They do not count toward
                      these statistics.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-expanded={showInterrupted}
                    aria-controls={interruptedId}
                    onClick={() => setShowInterrupted((show) => !show)}
                  >
                    {showInterrupted ? "Hide tasks" : "Show tasks"}
                  </Button>
                </div>
                {showInterrupted ? (
                  <section id={interruptedId} className="stats-interrupted">
                    <h2>Interrupted tasks</h2>
                    {stats.interrupted.tasks ? (
                      <TaskRows rows={stats.interrupted.tasks} stats={stats} interrupted />
                    ) : (
                      <p role="status">Loading interrupted tasks…</p>
                    )}
                  </section>
                ) : null}
              </>
            ) : null}
            {stats.canceledCount > 0 ? (
              <p className="stats-excluded">
                {stats.canceledCount} canceled {stats.canceledCount === 1 ? "task" : "tasks"}{" "}
                excluded.
              </p>
            ) : null}
            {stats.summary.count === 0 ? (
              <div className="stats-state">
                <EmptyState
                  icon="Clock"
                  title="No duration data yet"
                  description="Stats will appear here after tasks with a recorded start move to done."
                  action={
                    <p className="stats-empty-note">
                      Existing creation and update dates do not establish task duration. Missing
                      status history is not backfilled.
                    </p>
                  }
                />
              </div>
            ) : (
              <>
                <div className="stats-breakdowns">
                  <MeasuresTable title="By project" rows={stats.byProject} />
                  <MeasuresTable
                    title="By priority"
                    rows={stats.byPriority.map((row) => ({
                      ...row,
                      id: row.priority,
                      name: PRIORITY_LABELS[row.priority],
                    }))}
                  />
                </div>
                <section className="stats-slowest">
                  <h2>Slowest completed tasks</h2>
                  <TaskRows rows={stats.slowest} stats={stats} />
                </section>
              </>
            )}
          </>
        )}
      </div>
      <footer className="stats-explanation">
        <h2>How duration works</h2>
        <p>
          First move to in progress until the last move to done. Review time counts. Reopened tasks
          count until done again. A return to todo or backlog flags an interruption.
        </p>
        <p>Each subtask counts individually. Project and priority reflect the task now.</p>
        {stats && stats.unavailableCompletedCount > 0 ? (
          <p>
            {stats.unavailableCompletedCount} completed{" "}
            {stats.unavailableCompletedCount === 1 ? "task has" : "tasks have"} unavailable duration
            and {stats.unavailableCompletedCount === 1 ? "is" : "are"} not counted.
          </p>
        ) : null}
      </footer>
    </div>
  );
}
