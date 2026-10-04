import { expect, it } from "vitest";
import { createFakePluginHost, makeHostResponse } from "@get-bb/plugin-sdk/testing";
import plugin from "./server.js";
const query={startDate:"2026-09-01",timezone:"UTC",group:"workspace",scope:{kind:"host"}};
it("routes only the frozen calendar query without metadata, account, quota or import work",async()=>{
 const {bb,harness}=createFakePluginHost({pluginId:"codex-quota",sdk:{hosts:{get:async({hostId}:{hostId:string})=>makeHostResponse({id:hostId})}},experimental_callHostRpc:async()=>({state:"unavailable",reason:"not-configured"})});
 await plugin(bb);
 const selection=await harness.behavior.callRpc("selectHost",{hostId:"host_a"}) as {generation:number};
 expect(await harness.behavior.callRpc("calendarReport",{hostId:"host_a",generation:selection.generation,query})).toEqual({state:"unavailable",reason:"not-configured"});
 expect(harness.experimental_hostRpcCalls.map(call=>({method:call.method,input:call.input}))).toEqual([{method:"calendarReport",input:query}]);
 expect(harness.inspection.sdk.calls.map(call=>call.path)).toEqual(["hosts.get","hosts.get","hosts.get"]);
 await harness.lifecycle.dispose();
});
it.each([
 {startDate:"2026-02-30",timezone:"UTC",group:"workspace",scope:{kind:"host"}},
 {startDate:"2026-09-01",timezone:"Mars/Invalid",group:"workspace",scope:{kind:"host"}},
 {startDate:"2026-09-01",timezone:"",group:"workspace",scope:{kind:"host"}},
 {startDate:"2026-09-01",timezone:"+02:00",group:"workspace",scope:{kind:"host"}},
 {startDate:"2026-09-01",timezone:"UTC",group:"thread",scope:{kind:"workspace",workspace:"/original"}},
 {startDate:"2026-09-01",timezone:"UTC",group:"workspace",scope:{kind:"workspace",workspace:"relative"}},
 {startDate:"2026-09-01",timezone:"UTC",group:"workspace",scope:{kind:"host"},endDate:"2026-10-02"},
])("rejects invalid calendar inputs before dispatch %#",async(query)=>{
 const {bb,harness}=createFakePluginHost({pluginId:"codex-quota"});await plugin(bb);
 await expect(harness.behavior.callRpc("calendarReport",{hostId:"host_a",generation:0,query})).rejects.toThrow();
 expect(harness.experimental_hostRpcCalls).toHaveLength(0);await harness.lifecycle.dispose();
});
it.each(["switch","dispose"])("suppresses a late report after %s",async(action)=>{
 let finish!:(value:unknown)=>void,entered!:()=>void;const pendingResult=new Promise(resolve=>{finish=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
 const {bb,harness}=createFakePluginHost({pluginId:"codex-quota",sdk:{hosts:{get:async({hostId}:{hostId:string})=>makeHostResponse({id:hostId})}},experimental_callHostRpc:async()=>{entered();return pendingResult;}});await plugin(bb);
 const selection=await harness.behavior.callRpc("selectHost",{hostId:"host_a"}) as {generation:number};
 const pending=harness.behavior.callRpc("calendarReport",{hostId:"host_a",generation:selection.generation,query});await started;
 if(action==="switch")await harness.behavior.callRpc("selectHost",{hostId:"host_b"});else await harness.lifecycle.dispose();
 finish({state:"unavailable",reason:"not-configured"});expect(await pending).toEqual({state:"unavailable",reason:"selection-changed"});expect(harness.experimental_hostRpcCalls[0]?.signal?.aborted).toBe(true);
 if(action==="switch")await harness.lifecycle.dispose();
});
it("cancels immediately before dispatch when enrollment preparation is disposed",async()=>{
 let finish!:()=>void,entered!:()=>void;const prepared=new Promise<void>(resolve=>{finish=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
 const {bb,harness}=createFakePluginHost({pluginId:"codex-quota",sdk:{hosts:{get:async({hostId}:{hostId:string})=>makeHostResponse({id:hostId})}},experimental_callHostRpc:async()=>{throw Error("must not dispatch");}});await plugin(bb);
 const selection=await harness.behavior.callRpc("selectHost",{hostId:"host_a"}) as {generation:number};
 harness.inspection.sdk.stub("hosts.get",async()=>{entered();await prepared;return makeHostResponse({id:"host_a"});});
 const pending=harness.behavior.callRpc("calendarReport",{hostId:"host_a",generation:selection.generation,query});await started;await harness.lifecycle.dispose();finish();
 expect(await pending).toEqual({state:"unavailable",reason:"selection-changed"});expect(harness.experimental_hostRpcCalls).toHaveLength(0);
});
it("rejects a valid-shaped report for a different frozen query",async()=>{
 const {calendarSnapshot}=await import("./calendar-test-support.js");
 const {bb,harness}=createFakePluginHost({pluginId:"codex-quota",sdk:{hosts:{get:async({hostId}:{hostId:string})=>makeHostResponse({id:hostId})}},experimental_callHostRpc:async()=>calendarSnapshot({startDate:"2026-08-02",timezone:"UTC",group:"workspace",scope:{kind:"host"}})});await plugin(bb);
 const selected=await harness.behavior.callRpc("selectHost",{hostId:"host_a"}) as {generation:number};expect(await harness.behavior.callRpc("calendarReport",{hostId:"host_a",generation:selected.generation,query})).toEqual({state:"unavailable",reason:"unsupported"});await harness.lifecycle.dispose();
});
it("rejects daily values outside the request range even when the echoed query matches",async()=>{
 const {calendarSnapshot}=await import("./calendar-test-support.js");const input={startDate:"2026-09-01",timezone:"UTC",group:"workspace" as const,scope:{kind:"host" as const}};
 const {bb,harness}=createFakePluginHost({pluginId:"codex-quota",sdk:{hosts:{get:async({hostId}:{hostId:string})=>makeHostResponse({id:hostId})}},experimental_callHostRpc:async()=>{const value=calendarSnapshot(input);value.days[0].date="2026-08-01";return value;}});await plugin(bb);
 const selected=await harness.behavior.callRpc("selectHost",{hostId:"host_a"}) as {generation:number};expect(await harness.behavior.callRpc("calendarReport",{hostId:"host_a",generation:selected.generation,query:input})).toEqual({state:"unavailable",reason:"unsupported"});await harness.lifecycle.dispose();
});
