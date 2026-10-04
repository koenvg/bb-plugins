import { calendarReportSchema, calendarUnavailable, type CalendarQuery } from "./calendar-contract.js";
import type { HistoryRequest } from "./history-contract.js";
export function createCalendarReader(deps:{selection():{hostId:string|null;generation:number};enrolled(hostId:string):Promise<{status:string}|null>;activeReads:Set<AbortController>;call(hostId:string,signal:AbortSignal,query:CalendarQuery):Promise<unknown>}) {
 return async (input:HistoryRequest & {query:CalendarQuery})=>{
  const {hostId,generation}=input, query=structuredClone(input.query), key=JSON.stringify(query), selected=deps.selection();
  if(!selected.hostId)return calendarUnavailable("no-selection");
  if(selected.generation!==generation)return calendarUnavailable("selection-changed");
  if(selected.hostId!==hostId)return calendarUnavailable("foreign-host");
  const controller=new AbortController();deps.activeReads.add(controller);
  const changed=()=>controller.signal.aborted||deps.selection().hostId!==hostId||deps.selection().generation!==generation;
  try {
   const host=await deps.enrolled(hostId);
   if(changed())return calendarUnavailable("selection-changed");
   if(!host||host.status!=="connected")return calendarUnavailable("host-offline");
   // Last synchronous cancellation check immediately before host dispatch.
   if(changed())return calendarUnavailable("selection-changed");
   const result=await deps.call(hostId,controller.signal,query);
   if(changed())return calendarUnavailable("selection-changed");
   const current=await deps.enrolled(hostId);
   if(changed())return calendarUnavailable("selection-changed");
   if(!current||current.status!=="connected")return calendarUnavailable("host-offline");
   const parsed=calendarReportSchema.safeParse(result);
   return parsed.success&&(parsed.data.state==="unavailable"||JSON.stringify(parsed.data.query)===key)?parsed.data:calendarUnavailable("unsupported");
  }catch{return calendarUnavailable(changed()?"selection-changed":"unsupported");}
  finally{deps.activeReads.delete(controller);}
 };
}
