// No provider identity/Pi session ID equality, path heuristics or timestamp joins.
export type IdentityEdge = { providerIdentity: string; threadId: string };
export type ConfirmedRelationship = { sessionId: string; providerIdentity: string; workspace: string };
export type IdentityRecord = { sessionId: string; providerSessionKey: string | null; claimedThreadId: string | null; workspace: string | null };
export type AttributionGrade = "exact-thread" | "workspace-only" | "ambiguous" | "unattributed";
export const validThreadId = (id: string) => /^thr_[A-Za-z0-9_-]{1,124}$/.test(id);
export function resolveIdentity(record: IdentityRecord, edges: IdentityEdge[], imports: ConfirmedRelationship[], complete: boolean): {grade: AttributionGrade; threadId: string | null} {
  const keys = new Set(imports.filter(row => row.sessionId === record.sessionId && row.workspace === record.workspace).map(row => row.providerIdentity));
  if (record.providerSessionKey) keys.add(record.providerSessionKey.slice(0,-6));
  return resolveCandidates(record, edges.filter(row => keys.has(row.providerIdentity)).map(row => row.threadId), complete);
}
export function resolveCandidates(record: IdentityRecord, threadIds: string[], complete: boolean): {grade: AttributionGrade; threadId: string | null} {
  const fallback = {grade: record.workspace ? "workspace-only" : "unattributed",threadId:null} as const;
  if (record.claimedThreadId && !validThreadId(record.claimedThreadId)) return {grade:"ambiguous",threadId:null};
  const candidates = new Set(threadIds);
  if (candidates.size > 1 || (candidates.size && record.claimedThreadId && !candidates.has(record.claimedThreadId))) return {grade:"ambiguous",threadId:null};
  if (!complete || candidates.size !== 1) return fallback;
  const threadId = [...candidates][0]!;
  return validThreadId(threadId) ? {grade:"exact-thread",threadId} : {grade:"ambiguous",threadId:null};
}
