// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HistoryReadinessPanel } from "./history-view.js";
import type { HistoryReadiness } from "./history-contract.js";
afterEach(cleanup);
const missing:HistoryReadiness={state:"not-configured",reason:"not-configured",storage:"unconfigured",collector:"missing",writer:"unconfirmed"};
const installed:HistoryReadiness={state:"available",reason:"ok",storage:"compatible",collector:"compatible-v1",writer:"unconfirmed",collection:{enabled:true,firstObservedAt:"2026-10-01T00:00:00.000Z",pauseCount:0,backlog:false,invalidRecords:0,unconfirmedEvents:0,conflictingEntries:0,workspaces:[],truncated:false}};
const selection={hostId:"host_a",generation:1};
it("does no installation on mount/disclosure; explicit install, repair, pause and resume show honest state",async()=>{
  const control=vi.fn(async ({action})=>({...installed,collection:{...installed.collection!,enabled:action!=="pause",pauseCount:1}}));
  render(<HistoryReadinessPanel selection={selection} read={async()=>missing} control={control}/>);
  await screen.findByText("History not configured on this host.");expect(control).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Collection and privacy"));expect(control).not.toHaveBeenCalled();
  for(const [name,action] of [["Install collector","install"],["Repair collector","repair"],["Pause capture","pause"],["Resume capture","resume"]]) {
    await act(async()=>{fireEvent.click(screen.getByRole("button",{name}));});
    expect(control).toHaveBeenLastCalledWith({...selection,action});
  }
  expect(screen.getByText(/No captured usage yet/)).toBeTruthy();expect(screen.getByText(/not per-thread totals/)).toBeTruthy();
  expect(screen.getByText(/Writer activation: unconfirmed/)).toBeTruthy();
});
it("cancels queued controls at selection transition and at disposal",async()=>{
  const control=vi.fn(async()=>installed),read=async()=>missing;
  const f=render(<HistoryReadinessPanel selection={selection} read={read} control={control}/>);await screen.findByText("History not configured on this host.");
  act(()=>{fireEvent.click(screen.getByRole("button",{name:"Install collector"}));f.rerender(<HistoryReadinessPanel selection={selection} selectionPending selectionRevision={1} read={read} control={control}/>);});
  await act(async()=>{});expect(control).not.toHaveBeenCalled();
  f.rerender(<HistoryReadinessPanel selection={selection} selectionRevision={2} read={read} control={control}/>);await screen.findByText("History not configured on this host.");
  act(()=>{fireEvent.click(screen.getByRole("button",{name:"Install collector"}));f.unmount();});await act(async()=>{});expect(control).not.toHaveBeenCalled();
});
it("excludes late control results after switching away/back to same selection revision",async()=>{
  let finish!:(value:unknown)=>void;const pending=new Promise(resolve=>{finish=resolve;});const control=vi.fn(()=>pending),read=async()=>missing;
  const f=render(<HistoryReadinessPanel selection={selection} read={read} control={control}/>);await screen.findByText("History not configured on this host.");
  fireEvent.click(screen.getByRole("button",{name:"Install collector"}));await waitFor(()=>expect(control).toHaveBeenCalledOnce());
  f.rerender(<HistoryReadinessPanel selection={selection} selectionPending selectionRevision={1} read={read} control={control}/>);
  expect((screen.getByRole("button",{name:"Install collector"}) as HTMLButtonElement).disabled).toBe(true);
  f.rerender(<HistoryReadinessPanel selection={selection} selectionRevision={2} read={read} control={control}/>);
  await act(async()=>{finish(installed);});expect(screen.queryByText(/Selected-host workspace totals/)).toBeNull();
  await screen.findByText("History not configured on this host.");
});
