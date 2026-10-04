import type { HistoryDatabase } from "./history-storage.js";
import { readCalendarTotals, effectiveRetentionState } from "./history-retention.js";
import { readCoverage } from "./history-coverage.js";
import { calendarDays, dayBoundary, latestStart, shiftDate } from "./calendar-time.js";
import { calendarQuerySchema, calendarReportSchema, calendarUnavailable, type CalendarQuery, type CalendarReport, type CalendarSnapshot } from "./calendar-contract.js";
import { checkedCount, queryScope, scopeFilter } from "./calendar-aggregation.js";
import { historyObserved } from "./history-projection.js";

export function readCalendarReport(db:HistoryDatabase,input:CalendarQuery,now:number):CalendarReport {
  const query=calendarQuerySchema.parse(input), retention=effectiveRetentionState(db,now), latest=latestStart(now,query.timezone);
  const boundaries=calendarDays(query.startDate,query.timezone), start=boundaries[0].start,end=boundaries[29].end;
  if(!retention.compact_cutoff || start<retention.compact_cutoff || query.startDate>latest) return calendarUnavailable("range-unavailable");
  if(!retention.backfill_done) return calendarUnavailable("storage-unavailable");
  // Never expose stale exact bindings while catalog delivery or re-resolution is incomplete.
  const receipt=db.prepare("SELECT generation,complete,backfilled,revision FROM identity_receipt WHERE id=1").get() as {generation:number;complete:number;backfilled:number;revision:number};
  const identityPending=!retention.backfill_done||!receipt.backfilled||!!db.prepare("SELECT 1 FROM identity_usage WHERE revision<? LIMIT 1").get(receipt.revision);
  const identity=!receipt.generation?"unknown" as const:!receipt.complete?"partial" as const:"complete" as const;
  if(query.group==="thread"&&(identity!=="complete"||identityPending)) return calendarUnavailable("identity-unavailable");
  const scope=queryScope(query), filter=scopeFilter({...scope,group:query.group});
  const totals=readCalendarTotals(db,{start,end,timezone:query.timezone,...scope,group:query.group},now);
  const excludedFilter=query.scope.kind==="workspace"?{sql:"c.workspace=?",values:[query.scope.workspace]}:query.scope.kind==="thread"?{sql:"c.verified_thread=?",values:[query.scope.threadId]}:{sql:"1=1",values:[]};
  const excludedStatement=db.prepare(`SELECT coalesce(sum(c.total),0) AS total FROM usage_compact c WHERE ${excludedFilter.sql} AND c.occurred_at>=? AND c.occurred_at<? AND (c.accepted=0${query.group==="thread"&&query.scope.kind==="host"?" OR c.verified_thread IS NULL":""})`);
  const days:CalendarSnapshot["days"]=boundaries.map(day=>{
    const recorded=totals.days.find(row=>row.date===day.date);
    const coverage=readCoverage(db,{start:day.start,end:day.end,...scope});
    const excludedTokens=checkedCount((excludedStatement.get(...excludedFilter.values,day.start,day.end) as {total:number}).total);
    return {date:day.date,totalTokens:recorded?.totalTokens??0,activeEntities:recorded?.activeEntities??0,excludedTokens,coverage,
      classes:!recorded||recorded.detailMissing?{state:"unavailable"}:{state:"available",input:recorded.input,output:recorded.output,reasoning:recorded.reasoning,cacheRead:recorded.cacheRead,cacheWrite:recorded.cacheWrite}};
  });
  const entity=query.group==="thread"?"c.verified_thread":"c.workspace";
  const summary=db.prepare(`SELECT coalesce(sum(c.total),0) AS totalTokens,count(DISTINCT ${entity}) AS activeEntities FROM usage_compact c WHERE c.accepted=1 AND ${filter.sql} AND c.occurred_at>=? AND c.occurred_at<?`).get(...filter.values,start,end) as {totalTokens:number;activeEntities:number};
  checkedCount(summary.totalTokens);checkedCount(summary.activeEntities);
  const ranked=db.prepare(`SELECT ${entity} AS key,sum(c.total) AS totalTokens,count(DISTINCT c.verified_thread) AS exact,
    sum(CASE WHEN c.verified_thread IS NULL THEN 1 ELSE 0 END) AS unbound,
    sum(CASE WHEN i.grade='ambiguous' THEN 1 ELSE 0 END) AS ambiguous
    FROM usage_compact c LEFT JOIN identity_usage i ON i.event_id=c.event_id
    WHERE c.accepted=1 AND ${filter.sql} AND c.occurred_at>=? AND c.occurred_at<? GROUP BY ${entity} ORDER BY totalTokens DESC,key LIMIT 50`).all(...filter.values,start,end) as {key:string;totalTokens:number;exact:number;unbound:number;ambiguous:number}[];
  const ranking:CalendarSnapshot["ranking"]=ranked.map(row=>{
    checkedCount(row.totalTokens);
    if(query.group==="workspace") return {key:row.key,label:row.key,metadata:"recorded-workspace",totalTokens:row.totalTokens,
      attribution:identity!=="complete"||identityPending?"unknown":row.ambiguous?"ambiguous":row.exact?(row.unbound?"mixed":"exact-thread"):"workspace-only",
      coverage:readCoverage(db,{start,end,workspace:row.key})};
    const meta=db.prepare("SELECT title,state FROM identity_metadata WHERE generation=? AND thread_id=?").get(receipt.generation,row.key) as {title:string|null;state:"available"|"archived"|"deleted"}|undefined;
    return {key:row.key,label:meta?.title??`${meta?.state==="deleted"?"Deleted":meta?.state==="archived"?"Archived":"Unavailable"} thread ${row.key}`,metadata:meta?.state??"missing",totalTokens:row.totalTokens,attribution:"exact-thread",coverage:readCoverage(db,{start,end,verifiedThread:row.key})};
  });
  const inactive=days.every(day=>day.coverage.zero), anyUsage=days.some(day=>day.activeEntities>0);
  const value:CalendarSnapshot={state:inactive?"observed-inactivity":anyUsage?"partial":"unknown",reason:"ok",query,observedAt:new Date(now).toISOString(),compactFrom:retention.compact_cutoff,capture:historyObserved(db)?"observed":"unconfirmed",
    previous:dayBoundary(shiftDate(query.startDate,-30),query.timezone)>=retention.compact_cutoff,next:shiftDate(query.startDate,30)<=latest,
    summary:{...summary,excludedTokens:checkedCount(days.reduce((n,day)=>n+day.excludedTokens,0))},days,ranking,truncated:summary.activeEntities>50,identity,identityPending};
  return calendarReportSchema.parse(value);
}
