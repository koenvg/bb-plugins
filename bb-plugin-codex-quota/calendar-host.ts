import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { inspectHistoryStorage, loadHistoryStorage, type HistoryDatabaseFactory } from "./history-storage.js";
import { readHistoryControl } from "./collector-control.js";
import { validHostDataDir } from "./collector-compatibility.js";
import { calendarQuerySchema, calendarUnavailable, type CalendarQuery, type CalendarReport } from "./calendar-contract.js";
import { readCalendarReport } from "./calendar-report.js";
/** Read-only report path. Validates control but changes no collector assets/control, metadata discovery, imports or account calls. */
export async function readHostCalendar(context:{signal:AbortSignal;dataDir:string;calendar:CalendarQuery},deps:{storage?:()=>Promise<HistoryDatabaseFactory|null>;now?:()=>number}):Promise<CalendarReport> {
  const {signal,dataDir}=context;
  if(signal.aborted) return calendarUnavailable("selection-changed");
  try {
    const query=calendarQuerySchema.parse(context.calendar);
    if(!validHostDataDir(dataDir)) return calendarUnavailable("storage-unavailable");
    const factory=await (deps.storage??loadHistoryStorage)();signal.throwIfAborted();
    if(!factory) return calendarUnavailable("storage-unavailable");
    const directory=join(dataDir,"history"),path=join(directory,"usage-v1.sqlite");
    const folder=await lstat(directory),file=await lstat(path);signal.throwIfAborted();
    if(!folder.isDirectory()||folder.isSymbolicLink()||!file.isFile()||file.isSymbolicLink()) return calendarUnavailable("storage-incompatible");
    const state=await inspectHistoryStorage(factory,path);signal.throwIfAborted();
    if(state!=="compatible") return calendarUnavailable(state==="incompatible"?"storage-incompatible":"storage-unavailable");
    const db=factory(path,true);
    try {
      if((db.prepare("PRAGMA user_version").get() as {user_version:number}).user_version!==4) return calendarUnavailable("storage-incompatible");
      await readHistoryControl(db,directory);
      signal.throwIfAborted();return readCalendarReport(db,query,(deps.now??Date.now)());
    } finally {db.close();}
  } catch(error) {
    return calendarUnavailable(signal.aborted?"selection-changed":error&&typeof error==="object"&&"code" in error&&error.code==="ENOENT"?"not-configured":"storage-unavailable");
  }
}
