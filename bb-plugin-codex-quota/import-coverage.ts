import type {HistoryDatabase} from "./history-storage.js";
import type {HistoryScope} from "./history-coverage.js";

type Progress={state:string;records:number;replayed:number;omissions:number;workspaces:string|null;unknown:number;diagnostics:string};
/** Consume the import ledger committed with discovery/read/cancel progress.
 * No transcript access and no second coverage authority. Unlocated omissions
 * affect every scope; known frozen workspaces constrain other import evidence. */
export function readImportCoverage(db:HistoryDatabase,start:string,end:string,scope:HistoryScope){
  const result={pending:false,uncertain:false,omissions:0,imported:false,truncated:false};
  if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='import_generations'").get())return result;
  const rows=db.prepare(`SELECT g.state,g.records,g.replayed,g.omissions,g.diagnostics,
    CASE WHEN json_valid(g.frozen) THEN json_extract(g.frozen,'$.workspaces') END AS workspaces,
    EXISTS(SELECT 1 FROM import_candidates c WHERE c.generation=g.id AND c.workspace IS NULL
      AND (c.state='omitted' OR g.state='canceled' AND c.state<>'done')) AS unknown
    FROM import_generations g WHERE start_at<? AND end_at>? ORDER BY start_at,id LIMIT 1001`).all(end,start) as Progress[];
  result.truncated=rows.length>1000;
  for(const row of rows.slice(0,1000)){
    let workspaces:string[]=[];
    try{const values=JSON.parse(row.workspaces??"null");if(!Array.isArray(values)||!values.length||values.length>50||values.some(value=>typeof value?.recorded!=="string"||!value.recorded.startsWith("/")))throw Error();workspaces=values.map(value=>value.recorded);}catch{/* Unknown original scope is not absence of evidence. */}
    const unknown=!workspaces.length || !!row.unknown || row.omissions>0 && /"(?:source-changed|discovery-limit)"/.test(row.diagnostics);
    const workspace=scope.kind==="host" ? undefined : scope.workspace;
    if(!unknown && workspace && !workspaces.includes(workspace))continue;
    result.pending ||= row.state==="stopped";
    result.uncertain ||= unknown || row.omissions>0 || row.state!=="completed" || row.records+row.replayed===0;
    result.imported ||= row.records+row.replayed>0;
    result.omissions+=row.omissions;
    if(!Number.isSafeInteger(result.omissions)){result.truncated=true;result.omissions=Number.MAX_SAFE_INTEGER;}
  }
  return result;
}
