// @vitest-environment jsdom
import { cleanup,render,waitFor } from "@testing-library/react";
import { afterEach,expect,it,vi } from "vitest";
const h=vi.hoisted(()=>{const list=vi.fn();return {list,sdk:{threads:{events:{list}}}};});
vi.mock("@get-bb/plugin-sdk/app",()=>({useSdk:()=>h.sdk}));
import { SubagentsPanel } from "./subagents-panel.js";
const state={kind:"pi-subagents-view",version:1,updatedAt:1,availability:"available",reason:"",omitted:0,rows:[{id:"owned",runId:"r",sessionId:"pi",generation:1,source:"foreground",kind:"subagent",label:"reviewer",state:"complete",incomplete:false,observedAt:1,capture:{status:"captured",capturedAt:1,finalOutput:"accepted answer"}}]};
const event=(kind:string,payload:unknown)=>({type:"thread/extensionState/updated",data:{kind,payload}});
afterEach(()=>{cleanup();vi.clearAllMocks();});
it("uses the public event list, filters its qualified kind and restores accepted data after remount",async()=>{
  h.list.mockResolvedValue([event("other/fake",{...state,rows:[]}),event("pi-subagents-provider/pi-subagents-view",state)]);
  const first=render(<SubagentsPanel threadId="owned-thread" params={{}}/>);
  await waitFor(()=>expect(first.getByText("accepted answer")).toBeDefined());
  expect(h.list.mock.calls[0]![0]).toMatchObject({threadId:"owned-thread",types:["thread/extensionState/updated"],order:"desc",limit:"64"});
  const signal=h.list.mock.calls[0]![0].signal as AbortSignal;
  first.unmount();expect(signal.aborted).toBe(true);
  const next={...state,rows:state.rows.map(row=>({...row,capture:{status:"unavailable",capturedAt:2,reason:"Artifact missing"}}))};
  h.list.mockResolvedValue([event("pi-subagents-provider/pi-subagents-view",next),event("pi-subagents-provider/pi-subagents-view",state)]);
  const second=render(<SubagentsPanel threadId="owned-thread" params={{}}/>);
  await waitFor(()=>expect(second.getByText("accepted answer")).toBeDefined());
  expect(second.getByText(/Capture unavailable: Artifact missing/)).toBeDefined();
});
it("shows unsupported stored state rather than accepting it as an empty success",async()=>{
  h.list.mockResolvedValue([event("pi-subagents-provider/pi-subagents-view",{...state,version:2})]);
  const view=render(<SubagentsPanel threadId="owned-thread" params={{}}/>);
  await waitFor(()=>expect(view.getByRole("alert").textContent).toContain("unsupported or malformed"));
});
