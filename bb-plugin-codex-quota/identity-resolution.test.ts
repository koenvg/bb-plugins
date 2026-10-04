import { expect, it } from "vitest";
import { resolveIdentity } from "./identity-resolution.js";
const record = { sessionId: "pi-header-id", providerSessionKey: "provider-a.jsonl", claimedThreadId: null, workspace: "/recorded" };
const identities = [{ providerIdentity: "provider-a", threadId: "thr_a" }, { providerIdentity: "provider-b", threadId: "thr_a" }];
it("resolves every provider identity without comparing it with Pi session ID", () => {
  for (const providerSessionKey of ["provider-a.jsonl", "provider-b.jsonl"]) expect(resolveIdentity({...record,providerSessionKey},identities,[],true)).toEqual({grade:"exact-thread",threadId:"thr_a"});
  expect(resolveIdentity({...record,providerSessionKey:"pi-header-id.jsonl"},identities,[],true).grade).toBe("workspace-only");
});
it("claims need unique evidence, and partial discovery never creates exact identity", () => {
  expect(resolveIdentity({...record,claimedThreadId:"thr_a"},[],[],true).grade).toBe("workspace-only");
  expect(resolveIdentity(record,identities,[],false).grade).toBe("workspace-only");
  expect(resolveIdentity({...record,claimedThreadId:"thr_b"},identities,[],true).grade).toBe("ambiguous");
  expect(resolveIdentity({...record,claimedThreadId:"../bad"},identities,[],true).grade).toBe("ambiguous");
});
it("conflicts stay ambiguous and confirmed imports join distinct IDs", () => {
  expect(resolveIdentity(record,[...identities,{providerIdentity:"provider-a",threadId:"thr_b"}],[],true).grade).toBe("ambiguous");
  const imported=[{sessionId:"pi-header-id",providerIdentity:"provider-b",workspace:"/recorded"}];
  expect(resolveIdentity({...record,providerSessionKey:null},identities,imported,true)).toEqual({grade:"exact-thread",threadId:"thr_a"});
  expect(resolveIdentity({...record,providerSessionKey:null,workspace:"/recorded-prefix"},identities,imported,true).grade).toBe("workspace-only");
});
it("shared paths, basenames and prefix collisions cannot identify a thread", () => {
  for(const workspace of ["/recorded","/recorded/sub","/other/recorded"]) expect(resolveIdentity({...record,providerSessionKey:null,workspace},identities,[],true)).toEqual({grade:"workspace-only",threadId:null});
  expect(resolveIdentity({...record,providerSessionKey:null,workspace:null},[],[],true).grade).toBe("unattributed");
});
