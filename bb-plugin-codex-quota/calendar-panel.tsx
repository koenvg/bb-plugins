import { useEffect, useRef, useState } from "react";
import { useRpc, useBbNavigate } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server.js";
import type { HistoryRequest } from "./history-contract.js";
import { calendarReportSchema, calendarUnavailable, type CalendarQuery, type CalendarReport } from "./calendar-contract.js";
import { latestStart, shiftDate, validTimezone } from "./calendar-time.js";
import { CalendarValues, reportButton, type TokenMetric } from "./calendar-view.js";
type Props={selection:{hostId:string|null;generation:number};selectionPending?:boolean;selectionRevision?:number;now:number;read(input:HistoryRequest&{query:CalendarQuery}):Promise<unknown>;onOpenThread?(id:string):void};
function viewerTimezone():string|null { try {const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;return validTimezone(zone)?zone:null;}catch{return null;} }
const reasons={"no-selection":"Select a host to view recorded tokens.","selection-changed":"Host selection changed. The earlier report is hidden.","foreign-host":"The report does not match the selected host.","host-offline":"Selected host is offline.","storage-unavailable":"History storage is unavailable or unfinished. Quota still works.","storage-incompatible":"History storage is incompatible or unsafe. Existing data is unchanged.","not-configured":"No retained history is configured on this host.","range-unavailable":"This 30-day range is outside the retained bounds. Use Latest 30 days.","identity-unavailable":"Exact-thread identity is unknown or still being resolved. Workspace reports remain separate.","unsupported":"The calendar report is unavailable in this host/plugin version."};
export function CalendarReportPanel({selection,selectionPending=false,selectionRevision=0,now,read,onOpenThread}:Props) {
 const [timezone]=useState(viewerTimezone),[start,setStart]=useState(()=>timezone?latestStart(now,timezone):null);
 const [group,setGroup]=useState<CalendarQuery["group"]>("workspace"),[scope,setScope]=useState<CalendarQuery["scope"]>({kind:"host"});
 const [metric,setMetric]=useState<TokenMetric>("tokens"),[date,setDate]=useState(""),[expanded,setExpanded]=useState(false),[attempt,setAttempt]=useState(0);
 const [comparison,setComparison]=useState(false);
 const query:CalendarQuery|null=timezone&&start?{startDate:start,timezone,group,scope,...(comparison?{comparison:true}:{})}:null;
 const queryKey=query?JSON.stringify(query):"",key=`${selection.hostId}:${selection.generation}:${selectionRevision}:${selectionPending}:${queryKey}`,requestKey=`${key}:${attempt}`;
 const latest=useRef(requestKey);latest.current=requestKey;
 const readRef=useRef(read);readRef.current=read;
 const [observation,setObservation]=useState<{key:string;view:CalendarReport;stale:boolean;attempt:number}|null>(null);
 useEffect(()=>{
  if(selectionPending||!selection.hostId||!query)return;
  const controller=new AbortController(),frozen={hostId:selection.hostId,generation:selection.generation,query:structuredClone(query)};
  const valid=()=>!controller.signal.aborted&&latest.current===requestKey;
  const accept=(value:unknown)=>{
   if(!valid())return;
   const parsed=calendarReportSchema.safeParse(value),view=parsed.success&&(parsed.data.state==="unavailable"||JSON.stringify(parsed.data.query)===queryKey)?parsed.data:calendarUnavailable("unsupported");
   setObservation(old=>view.state==="unavailable"&&old?.key===key&&old.view.state!=="unavailable"?{...old,stale:true,attempt}:{key,view,stale:false,attempt});
  };
  // Cancel just before dispatch. SDK frontend RPC has no request-signal parameter.
  void Promise.resolve().then(()=>valid()?readRef.current(frozen):null).then(accept).catch(()=>accept(calendarUnavailable("unsupported")));
  return ()=>controller.abort();
 },[requestKey]);
 const current=!selectionPending&&observation?.key===key?observation:null;
 const view=current?.view.state!=="unavailable"?current?.view:null;
 const loading=!!selection.hostId&&!selectionPending&&!!query&&(!current||current.attempt!==attempt);
 const stale=!!view&&(current!.stale||now-Date.parse(view.observedAt)>5*60000);
 const navigate=(next:string)=>{setStart(next);setDate("");setExpanded(false);};
 return <section className="mt-8 min-w-0 border-t border-border pt-4 text-sm" aria-label="Calendar token report" aria-busy={loading||selectionPending}>
  <h2 className="font-semibold">Recorded usage</h2>
  {query&&<p className="mt-2 text-muted-foreground [overflow-wrap:anywhere]">{query.startDate} to {shiftDate(query.startDate,29)} · {query.timezone} · {query.scope.kind==="host"?"Selected host":query.scope.kind==="workspace"?query.scope.workspace:query.scope.threadId}</p>}
  <div className="mt-3 flex flex-wrap items-center gap-2">
   <button type="button" className={reportButton} disabled={!view?.previous||loading||selectionPending} onClick={()=>start&&navigate(shiftDate(start,-30))}>Previous 30 days</button>
   <button type="button" className={reportButton} disabled={!view?.next||loading||selectionPending} onClick={()=>start&&navigate(shiftDate(start,30))}>Next 30 days</button>
   <label className="flex min-w-0 items-center gap-2">Group <select aria-label="Report grouping" className={`${reportButton} min-w-0 bg-background`} value={group} onChange={event=>{setGroup(event.target.value as CalendarQuery["group"]);setScope({kind:"host"});setDate("");setExpanded(false);}}><option value="workspace">Workspaces</option><option value="thread">Exact threads</option></select></label>
   <label className="flex min-w-0 items-center gap-2">Metric <select aria-label="Report metric" className={`${reportButton} min-w-0 max-w-full bg-background`} value={metric} onChange={event=>setMetric(event.target.value as TokenMetric)}><option value="tokens">Recorded tokens</option><option value="entities">Active entities</option><option value="per-entity">Tokens per active entity</option><option value="cost">Captured estimated cost</option><option value="cost-per-entity">Estimate per priced active entity</option></select></label>
   <label className="flex min-w-0 items-center gap-2">Compare <select aria-label="Report comparison" className={`${reportButton} min-w-0 max-w-full bg-background`} value={comparison?"previous":"off"} onChange={event=>setComparison(event.target.value==="previous")}><option value="off">Off</option><option value="previous">Previous 30 dates</option></select></label>
  </div>
  <div className="mt-2 flex flex-wrap gap-2"><button type="button" className={reportButton} disabled={!selection.hostId||!query||selectionPending||loading} onClick={()=>setAttempt(n=>n+1)}>Refresh report</button><button type="button" className={reportButton} disabled={!timezone||selectionPending} onClick={()=>timezone&&navigate(latestStart(now,timezone))}>Latest 30 days</button>{scope.kind!=="host"&&<button type="button" className={reportButton} onClick={()=>{setScope({kind:"host"});setDate("");setExpanded(false);}}>All entities</button>}</div>
  <p aria-live="polite" className="mt-3 text-muted-foreground">{!timezone?"Viewer IANA timezone is unavailable. No calendar values can be assigned.":selectionPending?"Changing selected host. Calendar report is pending.":!selection.hostId?reasons["no-selection"]:loading?"Loading calendar report…":current?.view.state==="unavailable"?reasons[current.view.reason]:stale?"Stale report for this same range and scope. Refresh failed or the index observation is older than five minutes.":""}</p>
  {view&&<CalendarValues view={view} metric={metric} comparisonBlocked={stale||loading} date={date} onDate={setDate} expanded={expanded} onExpanded={()=>setExpanded(true)} onInspect={entity=>{setScope(group==="workspace"?{kind:"workspace",workspace:entity}:{kind:"thread",threadId:entity});setExpanded(false);setDate("");}} onOpenThread={onOpenThread}/>}
 </section>;
}
export function CalendarReportSection(props:Omit<Props,"read"|"onOpenThread">) {
 const rpc=useRpc<typeof rpcContract>(),navigate=useBbNavigate();
 const rpcRef=useRef(rpc);rpcRef.current=rpc;
 const read=useRef((input:HistoryRequest&{query:CalendarQuery})=>rpcRef.current.call("calendarReport",input));
 return <CalendarReportPanel {...props} read={read.current} onOpenThread={id=>navigate.toThread(id)}/>;
}
