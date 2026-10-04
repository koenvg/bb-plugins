import type { CalendarQuery, CalendarSnapshot } from "./calendar-contract.js";
import { shiftDate } from "./calendar-time.js";
// Synthetic inputs for public RPC/React tests only. No source or account data.
export function calendarSnapshot(query:CalendarQuery,now=Date.parse("2026-10-01T12:00:00Z")):CalendarSnapshot {
 const uncovered={state:"uncovered" as const,zero:false,writerActive:false,pauses:0,omissions:0,uncertain:false,backlog:false,recoveryGap:false,truncated:false};
 const recorded={...uncovered,state:"observed" as const};
 return {state:"partial",reason:"ok",query,observedAt:new Date(now).toISOString(),compactFrom:"2026-06-22T00:00:00.000Z",capture:"observed",previous:true,next:query.startDate<"2026-09-01",summary:{totalTokens:600,activeEntities:60,excludedTokens:2},
  days:Array.from({length:30},(_,n)=>({date:shiftDate(query.startDate,n),totalTokens:n===14?600:0,activeEntities:n===14?60:0,excludedTokens:n===14?2:0,coverage:n===14?recorded:uncovered,classes:n===14?{state:"available",input:240,output:360,reasoning:100,cacheRead:200,cacheWrite:0}:{state:"unavailable"}})),
  ranking:Array.from({length:50},(_,n)=>({key:query.group==="workspace"?`/synthetic/workspace-${n+1}`:`thr_synthetic_${n+1}`,label:query.group==="workspace"?`/synthetic/workspace-${n+1}`:`Synthetic thread ${n+1}`,metadata:query.group==="workspace"?"recorded-workspace":"available",totalTokens:10,attribution:query.group==="workspace"?"workspace-only":"exact-thread",coverage:recorded})),truncated:true,identity:"complete",identityPending:false};
}
