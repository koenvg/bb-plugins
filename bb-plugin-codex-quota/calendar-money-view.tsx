import type { CalendarMoney } from "./calendar-contract.js";

export function capturedEstimate(value: number): string {
  return `$${value < 0.01 ? value.toString() : value.toLocaleString("en-US", { maximumSignificantDigits: 21 })}`;
}
export function compactEstimate(value: number): string {
  return `$${value > 0 && value < 0.01 ? value.toPrecision(3) : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function pricedAverage(money: CalendarMoney): string {
  if (money.capturedCost === null || !money.pricedEntities)
    return "Unavailable, no safe priced subtotal";
  const ratio = money.capturedCost / money.pricedEntities;
  return `${capturedEstimate(money.capturedCost)} / ${money.pricedEntities} = ${ratio > 0 ? capturedEstimate(ratio) : "Unavailable, below numeric range"}`;
}
export function pricingLabel(money: CalendarMoney): string {
  return `${money.pricedRecords} of ${money.records} accepted records priced; ${money.pricedEntities} priced active entities; pricing ${money.state}`;
}
export function MoneyValues({
  money,
  entities,
  compact = false,
}: {
  money: CalendarMoney;
  entities: string;
  compact?: boolean;
}) {
  if (compact)
    return (
      <p className="mt-1 text-muted-foreground tabular-nums [overflow-wrap:anywhere]">
        Captured estimate subtotal:{" "}
        {money.capturedCost === null ? "Unavailable" : capturedEstimate(money.capturedCost)} ·{" "}
        {money.pricedRecords} of {money.records} accepted records priced · {money.pricedEntities}{" "}
        priced active {entities} · Pricing {money.state}
        {money.reason === "unsafe-sum" ? ", unsafe monetary sum" : ""}.
      </p>
    );
  return (
    <div className="mt-2 min-w-0 tabular-nums [overflow-wrap:anywhere]">
      <p>
        Captured estimated cost subtotal:{" "}
        {money.capturedCost === null ? "Unavailable" : capturedEstimate(money.capturedCost)}.
      </p>
      <p>Estimate per priced active entity: {pricedAverage(money)}.</p>
      <p className="text-muted-foreground">
        {money.pricedRecords} of {money.records} accepted records priced · {money.pricedEntities}{" "}
        priced active {entities} · Pricing {money.state}. {money.records - money.pricedRecords}{" "}
        records have no eligible captured price.
        {money.reason === "unsafe-sum"
          ? " Monetary aggregate is outside the safe numeric range. Tokens remain separate."
          : money.capturedCost === null
            ? " No eligible priced records. Missing prices do not mean free use."
            : " Known priced subtotal only. Pricing does not prove complete collection."}
      </p>
    </div>
  );
}
