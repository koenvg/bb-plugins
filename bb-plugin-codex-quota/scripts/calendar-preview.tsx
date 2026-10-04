// Owned synthetic React preview. No BB installation, host, account or transcript access.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { QuotaDashboard } from "../quota-view.js";
import { CalendarReportPanel } from "../calendar-panel.js";
import { calendarSnapshot } from "../calendar-test-support.js";
import { shiftDate } from "../calendar-time.js";
const params=new URLSearchParams(location.search),state=params.get("state")??"partial",now=Date.parse("2026-10-01T12:00:00Z");
function Preview(){
 const [hostId,setHostId]=useState<string|null>("host_synthetic");
 return <><p className="px-5 py-2 text-sm">Owned synthetic BBP-20 preview. Not installed acceptance.</p><QuotaDashboard selectedHostId={hostId} hosts={[{id:"host_synthetic",name:"Synthetic host",status:"connected"}]} now={now} view={{state:"fresh",reason:"ok",snapshot:{observedAt:new Date(now).toISOString(),plan:null,general:[{id:"primary_window",name:"5 hours",remainingPercent:42,resetAt:new Date(now+3600000).toISOString()}],additional:[],bindingWindowId:"primary_window",bindingRemainingPercent:42,bankedResets:0}}} onHostChange={setHostId} onRefresh={()=>{document.body.dataset.quotaActions=String(Number(document.body.dataset.quotaActions??0)+1);}} history={<details className="mt-8 border-t border-border pt-4 text-sm"><summary>Collection and history management</summary><button type="button">Check readiness</button></details>}>
  <CalendarReportPanel now={now} selection={{hostId,generation:1}} onOpenThread={id=>{document.body.dataset.openedThread=id;}} read={async({query})=>{
   document.body.dataset.reportCalls=String(Number(document.body.dataset.reportCalls??0)+1);
   document.body.dataset.lastQuery=JSON.stringify(query);
   if(state==="loading")return new Promise(()=>{});
   if(state==="unavailable")return {state:"unavailable",reason:"storage-incompatible"};
   const view=calendarSnapshot(query,state==="stale"?now-600000:now);
   view.ranking[0].key=query.group==="workspace"?"/synthetic/"+"long-recorded-path-".repeat(12):"thr_synthetic_1";view.ranking[0].label=view.ranking[0].key;
   if(query.scope.kind!=="host"){view.summary.activeEntities=1;view.summary.totalTokens=10;view.ranking=view.ranking.slice(0,1);view.truncated=false;view.days[14].activeEntities=1;view.days[14].totalTokens=10;}
   if(state==="expired")view.days[14].classes={state:"unavailable"};
   if(state==="huge"){view.summary.totalTokens=Number.MAX_SAFE_INTEGER;view.days[14].totalTokens=Number.MAX_SAFE_INTEGER;view.ranking[0].totalTokens=Number.MAX_SAFE_INTEGER;}
   if(state==="deleted"&&query.group==="thread"){view.ranking[0].metadata="deleted";view.ranking[0].label="Deleted thread thr_synthetic_1";}
   if(state==="unknown"||state==="inactive"){
    view.state=state==="unknown"?"unknown":"observed-inactivity";view.summary={totalTokens:0,activeEntities:0,excludedTokens:0};view.ranking=[];view.truncated=false;
    view.days=view.days.map(day=>({...day,totalTokens:0,activeEntities:0,excludedTokens:0,classes:{state:"unavailable"},coverage:{...day.coverage,state:state==="inactive"?"observed-inactivity":"uncovered",zero:state==="inactive"}}));
   }
   view.previous=query.startDate>"2026-07-03";view.next=query.startDate<"2026-09-01";view.days[0].date=query.startDate;view.days[29].date=shiftDate(query.startDate,29);
   return view;
  }}/><details className="mt-8 border-t border-border pt-4 text-sm"><summary>Account activity</summary><p>Independent account read, not requested by this preview.</p></details>
 </QuotaDashboard></>;
}
createRoot(document.getElementById("root")!).render(<Preview/>);
