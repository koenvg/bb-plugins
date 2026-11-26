import { Fragment } from "react";
import { visibleView } from "../account/freshness.js";
import type { QuotaStatus } from "../quota/contract.js";
import type { QuotaWindow } from "../quota/quota.js";
import { CodexUsageLink, quotaReasonText } from "./accounts-view.js";
import type { MachineAccounts } from "./machines-contract.js";

const stamp = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const count = new Intl.NumberFormat("en-US");
const labels = "text-xs leading-snug text-muted-foreground";
const value = "mt-1 text-2xl leading-tight font-semibold tabular-nums @min-[42rem]:text-3xl";
const unit = "text-xs font-normal text-muted-foreground";
const unavailable = "mt-1 text-sm leading-[1.875rem] font-semibold @min-[42rem]:leading-9";
const grid = "grid grid-cols-2 gap-x-4 gap-y-3";
const card = "min-w-0 grow rounded-lg border border-border bg-[var(--card,var(--background))] p-3";

const UtcTime = ({ iso }: { iso: string }) => {
  return (
    <time dateTime={iso} className="tabular-nums">
      {stamp.format(new Date(iso))} UTC
    </time>
  );
};

const Observation = ({ view, loading }: { view?: QuotaStatus; loading: boolean }) => {
  const reason = view && quotaReasonText[view.reason];
  return (
    <>
      {view?.snapshot ? (
        <>
          {view.state === "stale" && <>Stale · </>}
          Observed <UtcTime iso={view.snapshot.observedAt} />
          {reason && ` · ${reason}`}
        </>
      ) : view ? (
        reason
      ) : null}
      {loading && <>{view && " · "}Refreshing allowance…</>}
    </>
  );
};

const WindowReading = ({
  window,
  now,
  compact = false,
}: {
  window: QuotaWindow;
  now: number;
  compact?: boolean;
}) => {
  const name =
    window.name === "5 hours"
      ? "5-hour window"
      : window.name === "7 days"
        ? "Weekly window"
        : window.name;
  return (
    <div className={compact ? "min-w-0" : `${card} basis-[13.5rem]`}>
      <dt className={`${labels} [overflow-wrap:anywhere]`}>{name}</dt>
      <dd className={compact ? "mt-0.5 text-base leading-tight font-semibold tabular-nums" : value}>
        {window.remainingPercent}% <span className={unit}>left</span>
      </dd>
      <dd className={`mt-0.5 ${labels}`}>
        {window.resetAt ? (
          <>
            {Date.parse(window.resetAt) <= now ? "Reset due · " : "Resets "}
            <UtcTime iso={window.resetAt} />
          </>
        ) : (
          "Reset time unknown"
        )}
      </dd>
    </div>
  );
};

function wholeCreditGroups(balance: string) {
  const [whole, fraction = ""] = balance.split(".");
  const integer = whole!.replace(/^0+(?=\d)/, "");
  return integer === "0" && /[1-9]/.test(fraction) ? ["<1"] : integer.split(/(?=(?:\d{3})+$)/);
}

export const AccountAllowance = ({
  data,
  now,
  loading,
}: {
  data: MachineAccounts | null;
  now: number;
  loading: boolean;
}) => {
  const accounts = data?.accounts ?? [];
  const shared = accounts.length === 1 && accounts[0]?.identity === "verified" && !data?.truncated;
  const onlyView = accounts.length === 1 ? visibleView(accounts[0]!.quota, now) : undefined;
  return (
    <section className="@container min-w-0" aria-label="Account allowance">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="text-base font-semibold">Account allowance</h2>
          <p className={`mt-1 ${labels}`}>
            Account-wide limits and balances. Separate from recorded machine usage.
          </p>
        </div>
        <p role="status" className={labels}>
          <Observation view={onlyView} loading={loading} />
        </p>
      </div>
      {!accounts.length && !loading && (
        <p className="text-sm text-muted-foreground">
          Account allowance unavailable. Enroll a persistent machine with Pi Codex sign-in.
        </p>
      )}
      <div className={accounts.length ? "divide-y divide-border border-y border-border" : ""}>
        {accounts.map((account, index) => {
          const view = onlyView ?? visibleView(account.quota, now);
          const snapshot = view.snapshot;
          const credits = snapshot?.credits;
          const banked = snapshot?.bankedResets;
          const machines = account.machines.map((id) =>
            data?.machines.find((machine) => machine.id === id),
          );
          const name = shared
            ? "Shared account"
            : account.identity === "unknown"
              ? `Account ${index + 1} · identity unavailable`
              : `Account ${index + 1}`;
          return (
            <section key={account.key} aria-label={`${name} allowance`} className="py-3">
              <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <h3 className="text-xs font-semibold">{name}</h3>
                <p className={`${labels} [overflow-wrap:anywhere]`}>
                  {machines.map((machine) => machine?.name ?? "Machine").join(" · ")}
                  {machines.some((machine) => machine?.status !== "connected") &&
                    " · Last known; machine sign-in unverified"}
                </p>
                {!onlyView && (
                  <p role="status" className={labels}>
                    <span className="sr-only">{name}: </span>
                    <Observation view={view} loading={false} />
                  </p>
                )}
              </div>
              <dl className="flex flex-wrap gap-5">
                <div className={`${card} basis-[15rem]`}>
                  <dt className={labels}>Paid credit balance</dt>
                  {credits?.kind === "balance" ? (
                    <dd className={value}>
                      <span>
                        {wholeCreditGroups(credits.balance).map((group, index, groups) => (
                          <Fragment key={index}>
                            {index > 0 && <wbr />}
                            {group}
                            {index < groups.length - 1 && "\u202f"}
                          </Fragment>
                        ))}
                      </span>{" "}
                      <span className={`mt-0.5 block leading-snug ${unit}`}>credits left</span>
                    </dd>
                  ) : (
                    <dd className={unavailable}>
                      {credits?.kind === "unlimited" ? "Unlimited" : "Unavailable"}
                    </dd>
                  )}
                </div>
                <div className={`${card} basis-[13.5rem]`}>
                  <dt className={labels}>Banked resets</dt>
                  {banked == null ? (
                    <dd className={unavailable}>Unavailable</dd>
                  ) : (
                    <dd className={`${value} [overflow-wrap:anywhere]`}>
                      {count.format(banked)} <span className={unit}>available</span>
                    </dd>
                  )}
                </div>
                {snapshot?.general.map((window) => (
                  <WindowReading key={window.id} window={window} now={now} />
                ))}
              </dl>
              {snapshot?.additional.map((limit, index) => (
                <div
                  key={`${limit.name}-${index}`}
                  className="mt-3 grid gap-x-4 gap-y-1.5 border-t border-border pt-2.5 @min-[42rem]:grid-cols-2 @min-[42rem]:items-baseline"
                >
                  <h4 className="m-0 text-xs font-semibold [overflow-wrap:anywhere]">
                    {limit.name}
                  </h4>
                  <dl className={grid}>
                    {limit.windows.map((window) => (
                      <WindowReading key={window.id} window={window} now={now} compact />
                    ))}
                  </dl>
                </div>
              ))}
            </section>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
        <CodexUsageLink />
      </div>
    </section>
  );
};
