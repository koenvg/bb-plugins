import {
  currentConditions,
  qualityExplanation,
  qualityLabel,
  type WorkPr,
} from "./pr-presentation.js";

/** Only normalized evidence reaches presentation. No SDK or producer parsing in rows. */
export function PrRichDetail({ pr }: { pr: WorkPr }) {
  const rich = pr.rich;
  const usable = ["available", "incomplete"].includes(pr.details);
  const terminal = pr.state === "merged" || pr.state === "closed";
  return (
    <div className="mb-2 space-y-1 break-words text-xs text-muted-foreground">
      <p>
        {qualityLabel(pr)}. {qualityExplanation(pr)}
      </p>
      {currentConditions(pr).map((condition) => (
        <p
          key={condition}
          className={
            [
              "Conflicts",
              "Checks failing",
              "Changes requested",
              "Other merge blockers",
              "Checks cancelled",
              "Queue failed",
            ].includes(condition)
              ? "text-destructive"
              : undefined
          }
        >
          {condition}
        </p>
      ))}
      {rich ? (
        <>
          <p>
            {usable ? "Observed" : "Last reported, not current"}{" "}
            <time dateTime={rich.refreshedAt}>{rich.refreshedAt}</time>
          </p>
          {terminal ? (
            <p>
              Final recorded counts and conditions do not affect terminal
              lifecycle.
            </p>
          ) : null}
          {rich.queue ? (
            <>
              <p>
                Merge queue: {rich.queue.state}
                {rich.queue.position !== null
                  ? ` · Position ${rich.queue.position}`
                  : ""}
              </p>
              <p>Reported queue evidence: {rich.queue.reported}</p>
            </>
          ) : null}
          {rich.mergeObservations?.map((observation) => (
            <p key={observation}>{observation}</p>
          ))}
          <p>
            Checks: {rich.checks.failed} failed · {rich.checks.running} running
            · {rich.checks.cancelled} cancelled · {rich.checks.passed} passed ·{" "}
            {rich.checks.skipped} skipped
          </p>
          {rich.checks.failedNames.length ? (
            <p>Reported failing checks: {rich.checks.failedNames.join(", ")}</p>
          ) : null}
          <p>
            Reviewers: {rich.reviewers.pending} pending ·{" "}
            {rich.reviewers.approved} approved ·{" "}
            {rich.reviewers.changesRequested} changes requested
          </p>
          {rich.reviewers.pendingNames.length ? (
            <p>
              Reported pending reviewers:{" "}
              {rich.reviewers.pendingNames.join(", ")}
            </p>
          ) : null}
          {rich.conditions.length ? (
            <p>Reported conditions: {rich.conditions.join(", ")}</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
