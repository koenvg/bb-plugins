// @vitest-environment jsdom
import { act, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makeHostResponse } from "@get-bb/plugin-sdk/testing";
import type { CalendarQuery } from "./calendar-contract.js";
import { calendarSnapshot } from "./calendar-test-support.js";
const app=await loadPluginApp(()=>import("./app.js"));
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
it("navigates a fixed calendar report with keyboard-readable detail and no account or import calls",async()=>{
 vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
 const options={sdk:{hosts:{list:async()=>[makeHostResponse({id:"host_a"})]}},rpc:{selection:async()=>({hostId:"host_a",generation:1}),read:async()=>({state:"unavailable",reason:"auth-required",snapshot:null}),historyReadiness:async()=>({state:"not-configured",reason:"not-configured",storage:"unconfigured",collector:"missing",writer:"unconfirmed"}),calendarReport:async({query}:{query:CalendarQuery})=>calendarSnapshot(query)}};
 const owner=renderSlot(app.appOverlays.find(item=>item.id==="quota-refresh")!,{},options),page=renderSlot(app.navPanels[0]!,{subPath:""},options),q=within(page.container);
 await q.findByRole("group",{name:"Daily recorded values"});
 const before=page.inspection.rpcCalls.length;
 fireEvent.click(q.getByRole("button",{name:/2026-09-15.*600 recorded tokens/}));
 expect(q.getByRole("region",{name:"Daily detail"}).textContent).toContain("Daily denominator: 60");
 expect(q.getByRole("region",{name:"Daily detail"}).textContent).toContain("600");
 expect(q.getByRole("button",{name:"Next 30 days"})).toHaveProperty("disabled",true);
 expect(q.getAllByRole("button",{name:/Inspect \/synthetic\/workspace-/})).toHaveLength(10);
 fireEvent.click(q.getByRole("button",{name:"Show up to 50"}));expect(q.getAllByRole("button",{name:/Inspect \/synthetic\/workspace-/})).toHaveLength(50);
 fireEvent.click(q.getByRole("button",{name:"Previous 30 days"}));
 await waitFor(()=>expect(q.getByRole("group",{name:"Daily recorded values"}).textContent).toContain("2026-08-02"));
 expect(page.inspection.rpcCalls.slice(before).map(call=>call.method)).toEqual(["calendarReport"]);
 expect((page.inspection.rpcCalls.at(-1)?.input as {query:CalendarQuery}).query.startDate).toBe("2026-08-02");
 expect(q.getByRole("link",{name:/Open Codex Usage/})).toBeTruthy();
 page.lifecycle.unmount();owner.lifecycle.unmount();
});
function calendarPage(read:(input:{hostId:string;generation:number;query:CalendarQuery})=>unknown|Promise<unknown>,selectHost?:(input:{hostId:string|null})=>Promise<{hostId:string|null;generation:number}>) {
 vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
 const options={sdk:{hosts:{list:async()=>[makeHostResponse({id:"host_a",name:"Host A"}),makeHostResponse({id:"host_b",name:"Host B"})]}},rpc:{selection:async()=>({hostId:"host_a",generation:1}),selectHost:selectHost??(async({hostId}:{hostId:string|null})=>({hostId,generation:2})),read:async()=>({state:"unavailable",reason:"auth-required",snapshot:null}),historyReadiness:async()=>({state:"not-configured",reason:"not-configured",storage:"unconfigured",collector:"missing",writer:"unconfirmed"}),calendarReport:read}};
 const owner=renderSlot(app.appOverlays.find(item=>item.id==="quota-refresh")!,{},options),page=renderSlot(app.navPanels[0]!,{subPath:""},options);
 return {owner,page,q:within(page.container),stop:()=>{page.lifecycle.unmount();owner.lifecycle.unmount();}};
}
it("clears range/group/entity changes immediately and ignores an old range response",async()=>{
 let finish!:(value:unknown)=>void;let calls=0;
 const f=calendarPage(({query})=>++calls===2?new Promise(resolve=>{finish=resolve;}):calendarSnapshot(query));
 await f.q.findByRole("group",{name:"Daily recorded values"});fireEvent.click(f.q.getByRole("button",{name:"Previous 30 days"}));
 expect(f.q.queryByRole("group",{name:"Daily recorded values"})).toBeNull();await waitFor(()=>expect(calls).toBe(2));
 fireEvent.change(f.q.getByRole("combobox",{name:"Report grouping"}),{target:{value:"thread"}});await f.q.findByRole("group",{name:"Daily recorded values"});
 await act(async()=>{const old=calendarSnapshot({startDate:"2026-08-02",timezone:"UTC",group:"workspace",scope:{kind:"host"}});old.summary.totalTokens=987654;finish(old);});
 expect(f.q.queryByText(/987,654 recorded tokens/)).toBeNull();
 fireEvent.click(f.q.getByRole("button",{name:"Inspect thr_synthetic_1"}));await waitFor(()=>expect(calls).toBe(4));
 expect((f.page.inspection.rpcCalls.at(-1)?.input as {query:CalendarQuery}).query.scope).toEqual({kind:"thread",threadId:"thr_synthetic_1"});
 fireEvent.click(f.q.getByRole("button",{name:"All entities"}));await waitFor(()=>expect(calls).toBe(5));
 expect(f.page.inspection.rpcCalls.filter(call=>call.method==="calendarReport")).toHaveLength(5);f.stop();
});
it("invalidates the old host before selection completes and suppresses late values",async()=>{
 let finishRead!:(value:unknown)=>void,finishSelection!:(value:{hostId:string;generation:number})=>void;let count=0;
 const f=calendarPage(({query})=>++count===2?new Promise(resolve=>{finishRead=resolve;}):calendarSnapshot(query),async()=>new Promise(resolve=>{finishSelection=resolve;}));
 await f.q.findByRole("group",{name:"Daily recorded values"});fireEvent.click(f.q.getByRole("button",{name:"Refresh report"}));await waitFor(()=>expect(count).toBe(2));
 fireEvent.change(f.q.getByRole("combobox",{name:"Codex host"}),{target:{value:"host_b"}});expect(f.q.queryByRole("group",{name:"Daily recorded values"})).toBeNull();
 expect(f.q.getByText("Changing selected host. Calendar report is pending.")).toBeTruthy();
 await act(async()=>{const old=calendarSnapshot({startDate:"2026-09-01",timezone:"UTC",group:"workspace",scope:{kind:"host"}});old.summary.totalTokens=987654;finishRead(old);});
 expect(f.q.queryByText(/987,654 recorded tokens/)).toBeNull();await act(async()=>{finishSelection({hostId:"host_b",generation:2});});await f.q.findByRole("group",{name:"Daily recorded values"});expect(count).toBe(3);f.stop();
});
it("keeps a failed-refresh snapshot stale only for the same frozen key",async()=>{
 let count=0;const f=calendarPage(({query})=>++count===1?calendarSnapshot(query):Promise.reject(Error("synthetic failed read")));
 await f.q.findByRole("group",{name:"Daily recorded values"});fireEvent.click(f.q.getByRole("button",{name:"Refresh report"}));await f.q.findByText(/Stale report for this same range and scope/);
 expect(f.q.getByRole("group",{name:"Daily recorded values"})).toBeTruthy();
 fireEvent.click(f.q.getByRole("button",{name:"Previous 30 days"}));await f.q.findByText("The calendar report is unavailable in this host/plugin version.");expect(f.q.queryByRole("group",{name:"Daily recorded values"})).toBeNull();f.stop();
});
it("leaves missing viewer timezone explicit and sends no calendar request",async()=>{
 const original=Intl.DateTimeFormat.prototype.resolvedOptions;
 vi.spyOn(Intl.DateTimeFormat.prototype,"resolvedOptions").mockImplementation(function(){return {...original.call(this),timeZone:""};});
 const read=vi.fn();const f=calendarPage(read);
 await f.q.findByText("Viewer IANA timezone is unavailable. No calendar values can be assigned.");expect(read).not.toHaveBeenCalled();expect(f.q.getByRole("link",{name:/Open Codex Usage/})).toBeTruthy();f.stop();
});
it("cancels a queued calendar dispatch when the panel is disposed",async()=>{
 const read=vi.fn();const f=calendarPage(read);f.stop();await act(async()=>{await Promise.resolve();});expect(read).not.toHaveBeenCalled();
});
it("uses SDK navigation only for available or archived verified thread metadata",async()=>{
 const f=calendarPage(({query})=>{const view=calendarSnapshot(query);if(query.group==="thread"){view.ranking[0].metadata="deleted";view.ranking[0].label="Deleted thread thr_synthetic_1";view.ranking[1].metadata="archived";}return view;});await f.q.findByRole("group",{name:"Daily recorded values"});
 fireEvent.change(f.q.getByRole("combobox",{name:"Report grouping"}),{target:{value:"thread"}});await f.q.findByText("1. Deleted thread thr_synthetic_1");expect(f.q.queryByRole("button",{name:"Open thread thr_synthetic_1"})).toBeNull();
 fireEvent.click(f.q.getByRole("button",{name:"Open thread thr_synthetic_2"}));expect(f.page.inspection.navigateCalls).toEqual([{method:"toThread",threadId:"thr_synthetic_2"}]);f.stop();
});
it("shows recorded active entities even when the source token total is zero, without making a zero token bar",async()=>{
 const f=calendarPage(({query})=>{const view=calendarSnapshot(query);view.summary={totalTokens:0,activeEntities:1,excludedTokens:0};view.days[14].totalTokens=0;view.days[14].activeEntities=1;return view;});await f.q.findByRole("group",{name:"Daily recorded values"});
 expect(f.q.getByRole("button",{name:/2026-09-15: Gap; 1 active/})).toBeTruthy();
 fireEvent.change(f.q.getByRole("combobox",{name:"Report metric"}),{target:{value:"entities"}});
 expect(f.q.getByRole("button",{name:/2026-09-15: 0 recorded tokens; 1 active/})).toBeTruthy();f.stop();
});
it("does not label an uncovered empty range as zero tokens or zero activity",async()=>{
 const f=calendarPage(({query})=>{const view=calendarSnapshot(query);view.state="unknown";view.summary={totalTokens:0,activeEntities:0,excludedTokens:0};view.ranking=[];view.truncated=false;view.days=view.days.map(day=>({...day,totalTokens:0,activeEntities:0,classes:{state:"unavailable"},coverage:{...day.coverage,state:"uncovered",zero:false}}));return view;});await f.q.findByRole("group",{name:"Daily recorded values"});
 expect(f.q.getByText("Recorded token subtotal unknown · No recorded active entities")).toBeTruthy();expect(f.q.queryByText(/0 recorded tokens · 0 active/)).toBeNull();
 fireEvent.click(f.q.getByRole("button",{name:/2026-09-15: Gap/}));expect(f.q.getByText("Unknown subtotal, no records")).toBeTruthy();f.stop();
});
