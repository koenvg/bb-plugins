// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { IdentityTotals } from "./identity-view.js";
import type { AttributionView } from "./identity-contract.js";
afterEach(cleanup);
const view:AttributionView={discovery:"complete",backlog:false,grades:[{grade:"exact-thread",totalTokens:3,events:1},{grade:"workspace-only",totalTokens:6,events:2},{grade:"ambiguous",totalTokens:3,events:1},{grade:"unattributed",totalTokens:0,events:0}],threads:[{threadId:"thr_a",label:"A",state:"available",totalTokens:3,events:1},{threadId:"thr_old",label:"Archived thread thr_old",state:"archived",totalTokens:3,events:1},{threadId:"thr_gone",label:"Deleted thread thr_gone",state:"deleted",totalTokens:3,events:1},{threadId:"thr_missing",label:"Unavailable thread thr_missing",state:"missing",totalTokens:3,events:1}],truncated:true};
it("shows all grades, stable labels and navigation only for verified available/archived threads",()=>{
 const open=vi.fn();const page=render(<IdentityTotals view={view} onOpenThread={open}/>);
 expect(page.getByText("workspace-only: 6 recorded tokens, 2 events")).toBeTruthy();expect(page.getByText("Deleted thread thr_gone")).toBeTruthy();expect(page.getByText("Unavailable thread thr_missing")).toBeTruthy();
 fireEvent.click(page.getByRole("button",{name:"Open thread thr_a"}));fireEvent.click(page.getByRole("button",{name:"Open thread thr_old"}));expect(open.mock.calls).toEqual([["thr_a"],["thr_old"]]);expect(page.queryByRole("button",{name:"Open thread thr_gone"})).toBeNull();expect(page.getByText("Only the first 50 exact-thread rows are shown.")).toBeTruthy();
});
it.each(["unknown","partial"] as const)("does not show exact rows from %s discovery",discovery=>{
 const page=render(<IdentityTotals view={{...view,discovery}} onOpenThread={()=>{}}/>);expect(page.queryByRole("button")).toBeNull();expect(page.queryByText("A")).toBeNull();expect(page.getByText(/Exact totals are not available/)).toBeTruthy();
});
it("does not show stale numeric attribution during bounded reconciliation",()=>{
 const page=render(<IdentityTotals view={{...view,backlog:true}}/>);expect(page.queryByText("workspace-only: 6 recorded tokens, 2 events")).toBeNull();expect(page.getByText(/Attribution backlog remains/)).toBeTruthy();
});
