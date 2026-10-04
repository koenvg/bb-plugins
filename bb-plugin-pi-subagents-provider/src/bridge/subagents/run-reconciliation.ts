import { type AsyncSnapshot, type RunNode } from "./protocol.js";

export interface RetainedRun {
  node: RunNode;
  covered: boolean;
}

function mergeNode(previous: RunNode | undefined, next: RunNode): RunNode {
  if (!previous) return next;
  const children = new Map((previous.children ?? []).map((child) => [child.id, child]));
  for (const child of next.children ?? []) children.set(child.id, mergeNode(children.get(child.id), child));
  return { ...next, children: [...children.values()] };
}

function live(node: RunNode): boolean {
  return node.state === "running" || node.state === "queued" || (node.children ?? []).some(live);
}

/** Retain missing facts; coverage only changes when the owning root is received. */
export function reconcileRunTrees(retained: ReadonlyMap<string, RetainedRun>, snapshot: AsyncSnapshot) {
  const complete = snapshot.omitted.runs === 0 && snapshot.omitted.children === 0 && !snapshot.omitted.byteLimitExceeded;
  const roots = new Map(snapshot.runs.map((node) => [node.id, node]));
  const nestedOwners = new Set<string>();
  function collectNested(node: RunNode) {
    for (const child of node.children ?? []) {
      if (child.kind === "subagent" || child.kind === "workflow") nestedOwners.add(child.id);
      collectNested(child);
    }
  }
  for (const run of retained.values()) collectNested(run.node);
  for (const node of snapshot.runs) collectNested(node);
  let retainedNodes = 0;
  function updateDescendants(node: RunNode, depth = 0): RunNode {
    if (++retainedNodes > 256 || depth > 3) throw new Error("Retained child limit reached");
    return { ...node, children: (node.children ?? []).map((child) => {
      const canonical = child.kind === "subagent" || child.kind === "workflow" ? roots.get(child.id) : undefined;
      return updateDescendants(mergeNode(child, canonical ?? child), depth + 1);
    }) };
  }
  const candidates = new Map([...retained].map(([id, run]) => [id, run.node]));
  for (const node of snapshot.runs) {
    if (!nestedOwners.has(node.id)) candidates.set(node.id, node);
  }
  return [...candidates].map(([id, node]) => {
    const previous = retained.get(id);
    retainedNodes = 0;
    const merged = updateDescendants(mergeNode(previous?.node, node));
    const covered = roots.has(id) ? complete : previous?.covered ?? false;
    const hasLiveWork = live(merged);
    return { id, node: merged, covered, live: hasLiveWork, active: hasLiveWork || !covered || !complete };
  });
}
