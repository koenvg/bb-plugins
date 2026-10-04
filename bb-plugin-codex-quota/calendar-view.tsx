import type { CalendarSnapshot } from "./calendar-contract.js";
type Day=CalendarSnapshot["days"][number];
export type TokenMetric="tokens"|"entities"|"per-entity";
export const reportButton="rounded-md border border-border px-3 py-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50";
const exact=(value:number)=>value.toLocaleString("en-US",{maximumFractionDigits:0});
const average=(tokens:number,entities:number)=>entities?`${tokens} / ${entities} = ${(tokens/entities).toLocaleString("en-US",{maximumFractionDigits:2})}`:"Unavailable, no active entities";
export function coverageLabel(day:{coverage:Day["coverage"]}) {
 const c=day.coverage;
 return c.zero?"Observed inactivity":c.state==="unavailable"?"Unavailable":c.state==="uncovered"?"Unknown, uncovered gap":c.state==="imported"?"Partial, imported records":c.state==="incomplete"?"Partial, coverage gaps":"Partial, recorded usage";
}
function numeric(day:Day,metric:TokenMetric):number|null {
 if(metric==="entities"&&day.activeEntities>0)return day.activeEntities;
 if(day.totalTokens===0&&!day.coverage.zero)return null;
 if(day.coverage.zero)return metric==="per-entity"?null:0;
 return metric==="tokens"?day.totalTokens:metric==="entities"?day.activeEntities:day.activeEntities?day.totalTokens/day.activeEntities:null;
}
export function CalendarValues({view,metric,date,onDate,expanded,onExpanded,onInspect,onOpenThread}:{view:CalendarSnapshot;metric:TokenMetric;date:string;onDate(date:string):void;expanded:boolean;onExpanded():void;onInspect(key:string):void;onOpenThread?(key:string):void}) {
 const entities=view.query.group==="workspace"?"workspaces":"verified threads",day=view.days.find(d=>d.date===date)??view.days[0];
 const max=Math.max(1,...view.days.map(d=>numeric(d,metric)??0));
 const visible=view.ranking.slice(0,expanded?50:10);
 return <>
  <div className="mt-3 tabular-nums" aria-label="Range summary"><p>{!view.summary.activeEntities&&view.state!=="observed-inactivity"?"Recorded token subtotal unknown · No recorded active entities":`${exact(view.summary.totalTokens)} recorded tokens · ${view.summary.activeEntities} active ${entities}`}</p><p>Tokens per active entity: {average(view.summary.totalTokens,view.summary.activeEntities)}.</p></div>
  <p className="mt-2 text-muted-foreground">{view.state==="observed-inactivity"?"Observed inactivity across this scope and range.":view.state==="unknown"?"Unknown range. No accepted usage is recorded; missing history is not zero.":"Partial range. These are known subtotals, not complete account usage."} Range denominator: {view.summary.activeEntities} distinct {entities} with accepted records across all 30 dates. This is not completed work.</p>
  <div className="mt-4 grid h-36 grid-cols-[repeat(30,minmax(0,1fr))] items-end gap-[3px]" role="group" aria-label="Daily recorded values">
   {view.days.map(d=>{const value=numeric(d,metric),gap=value===null,label=`${d.date}: ${gap?"Gap":`${exact(d.totalTokens)} recorded tokens`}; ${d.activeEntities||d.coverage.zero?`${d.activeEntities} active ${entities}`:`Active ${entities} unknown`}; ${coverageLabel(d)}`;
    return <button key={d.date} type="button" aria-label={label} aria-pressed={d.date===day.date} onClick={()=>onDate(d.date)}
      className={`min-w-0 rounded-sm focus-visible:outline-2 focus-visible:outline-ring ${gap?"border border-dashed border-border bg-muted/30":"bg-primary/70"}`}
      style={{height:gap?"100%":`${Math.max(value===0?2:4,(value??0)/max*100)}%`}}><span className="sr-only">{d.date}</span></button>;
   })}
  </div>
  <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{view.days[0].date}</span><span>{view.days[29].date}</span></div>
  <p className="mt-2 text-xs text-muted-foreground">Dashed marks are gaps, not zero bars. Tab to a date and press Enter or Space for exact values. Solid marks are recorded subtotals; only observed inactivity permits a zero.</p>
  <section className="mt-4 min-w-0 rounded-md border border-border bg-muted/20 p-3" aria-label="Daily detail" aria-live="polite">
   <h3 className="font-semibold">{day.date}</h3>
   <dl className="mt-2 grid grid-cols-2 gap-2 tabular-nums"><dt>Recorded tokens</dt><dd>{day.activeEntities||day.coverage.zero?exact(day.totalTokens):"Unknown subtotal, no records"}</dd><dt>Active {entities}</dt><dd>{day.activeEntities||day.coverage.zero?day.activeEntities:"Unknown"}</dd><dt>Tokens per active entity</dt><dd className="[overflow-wrap:anywhere]">{average(day.totalTokens,day.activeEntities)}</dd><dt>Coverage</dt><dd>{coverageLabel(day)}</dd></dl>
   <p className="mt-3 text-muted-foreground">Daily denominator: {day.activeEntities} distinct {entities} with accepted recorded usage on this date. Timezone: {view.query.timezone}.</p>
   <details className="mt-3 text-muted-foreground"><summary className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring">Token classes and exclusions</summary>
    {day.classes.state==="unavailable"?<p className="mt-2">Token classes unavailable. Expired or missing classes are not zero.</p>:<dl className="mt-2 grid grid-cols-2 gap-2">{([['Input',day.classes.input],['Output',day.classes.output],['Reasoning',day.classes.reasoning],['Cache read',day.classes.cacheRead],['Cache write',day.classes.cacheWrite]] as const).map(([name,value])=><div key={name}><dt>{name}</dt><dd>{exact(value)}</dd></div>)}</dl>}
    <p className="mt-2">Source total is authoritative. Reasoning can overlap output. Cache classes are not added again.</p>
    <p className="mt-2">Excluded record tokens: {exact(day.excludedTokens)} on this date, {exact(view.summary.excludedTokens)} in the range. Excluded records can include replay copies. Exact-thread mode excludes unverified shares; no workspace share is allocated to a thread.</p>
    <p className="mt-2">Coverage evidence: {day.coverage.pauses} pauses; {day.coverage.omissions} omissions; uncertainty {day.coverage.uncertain?"yes":"no"}; backlog {day.coverage.backlog?"yes":"no"}; recovery gap {day.coverage.recoveryGap?"yes":"no"}; evidence truncated {day.coverage.truncated?"yes":"no"}.</p>
   </details>
  </section>
  <h3 className="mt-4 font-semibold">Ranked {entities}</h3>
  <p className="mt-2 text-muted-foreground">{visible.length} of {view.summary.activeEntities} entities shown. {view.truncated?"Ranking is truncated at 50.":"Ranking includes all retained entities in this range."} Aggregate totals and denominators include records beyond visible rows.</p>
  <ol className="mt-2 list-none space-y-3 p-0">{visible.map((row,n)=><li key={row.key} className="min-w-0 [overflow-wrap:anywhere]"><button type="button" className={`${reportButton} max-w-full text-left [overflow-wrap:anywhere]`} aria-label={`Inspect ${row.key}`} onClick={()=>onInspect(row.key)}>{n+1}. {row.label}</button><p className="mt-1">{exact(row.totalTokens)} tokens · {row.attribution} · {coverageLabel(row)}</p><p className="text-xs text-muted-foreground">{row.metadata==="recorded-workspace"?"Recorded workspace. Current path metadata unavailable.":`Thread metadata: ${row.metadata}. Stable ID: ${row.key}.`}</p>
    {view.query.group==="thread"&&["available","archived"].includes(row.metadata)&&onOpenThread&&<button type="button" className={`${reportButton} mt-1`} onClick={()=>onOpenThread(row.key)}>Open thread {row.key}</button>}
   </li>)}</ol>
  {!expanded&&view.ranking.length>10&&<button type="button" className={`${reportButton} mt-3`} onClick={onExpanded}>Show up to 50</button>}
  <details className="mt-4 text-muted-foreground"><summary className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring">Report limits</summary><p className="mt-2">Capture activation: {view.capture}. Identity catalog: {view.identity}; resolution pending: {view.identityPending?"yes":"no"}. This does not prove complete coverage. Imported usage is not live-observed capture. Shared workspace records count once. Thread and workspace views are alternatives, not additive totals. Retained compact facts start at {view.compactFrom}.</p><p className="mt-2">This report reads the retained index only. Check readiness to continue bounded ingestion or maintenance. Navigation does not refresh quota/activity, discover transcripts, resume import or change collection. No prices or subscription spending are calculated.</p></details>
 </>;
}
