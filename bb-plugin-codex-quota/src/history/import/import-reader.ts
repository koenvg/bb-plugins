import {
  keepUncertainUsage,
  uncertainCandidate,
  type UncertainReason,
} from "./import-uncertain.js";
import { realpath } from "node:fs/promises";
import { basename, join, normalize } from "node:path";
import { setImmediate as yieldWork } from "node:timers/promises";
import type { HistoryDatabase } from "../storage/history-storage.js";
import type { ImportDiagnostic } from "./import-contract.js";
import { recordConfirmedRelationship, verifyWorkspaceAlias } from "../identity/identity-storage.js";
import {
  admitImportedUsage,
  confirmedReplay,
  excludeCompactIdentity,
} from "../storage/history-projection.js";
import { confinedFile, revalidateFile } from "./import-source.js";
import { parseLine, importedHeaderSchema, entryIdentity, importedUsage } from "./import-parser.js";
import {
  diagnostic,
  omit,
  type Frozen,
  type Generation,
  type Candidate,
  type ImportOptions,
} from "./import-state.js";
import { validateFrozen } from "./import-catalog.js";
export async function header(
  db: HistoryDatabase,
  g: Generation,
  f: Frozen,
  c: Candidate,
  o: ImportOptions,
) {
  let source: Awaited<ReturnType<typeof confinedFile>> | undefined;
  try {
    o.signal.throwIfAborted();
    source = await confinedFile(f.roots[c.root], c.name);
    await revalidateFile(source.file, f.roots[c.root], c.name, source.stamp);
    o.signal.throwIfAborted();
    const bytes = Buffer.alloc(Math.min(64 * 1024, source.stamp.size));
    o.bodyRead?.();
    const { bytesRead } = await source.file.read(bytes, 0, bytes.length, 0);
    g.bytes += bytesRead;
    const end = bytes.subarray(0, bytesRead).indexOf(10);
    if (end < 0) {
      omit(db, g, c, bytesRead >= 64 * 1024 ? "oversize-record" : "invalid-record");
      return;
    }
    let parsed: ReturnType<typeof importedHeaderSchema.safeParse>;
    try {
      parsed = importedHeaderSchema.safeParse(parseLine(bytes.subarray(0, end)));
    } catch {
      omit(db, g, c, "invalid-record");
      return;
    }
    if (!parsed.success) {
      omit(db, g, c, "invalid-record");
      return;
    }
    const h = parsed.data;
    let workspace = h.cwd;
    let uncertainty: UncertainReason | null = null;
    try {
      workspace = await realpath(h.cwd);
    } catch {
      uncertainty = "workspace-unverified";
    }
    if (!f.workspaces.some((w) => w.resolved === workspace)) uncertainty = "workspace-unverified";
    if (uncertainty && !f.includeUncertain) {
      omit(db, g, c, uncertainty);
      return;
    }
    await revalidateFile(source.file, f.roots[c.root], c.name, source.stamp);
    o.signal.throwIfAborted();
    // Parent is a claim until its independently verified confined source and entry chain agree.
    let parent: string | null = null;
    if (h.parentSession) {
      const claimed = normalize(h.parentSession),
        allowed = f.roots.find(
          (r) =>
            claimed === join(r.configured, basename(claimed)) ||
            claimed === join(r.resolved, basename(claimed)),
        );
      if (!allowed) {
        if (!f.includeUncertain) {
          omit(db, g, c, "unresolved-ancestry");
          return;
        }
        uncertainty ??= "unresolved-ancestry";
      } else parent = join(allowed.resolved, basename(claimed));
    }
    if (
      parent &&
      !db.prepare("SELECT 1 FROM import_candidates WHERE generation=? AND path=?").get(g.id, parent)
    ) {
      if (!f.includeUncertain) {
        omit(db, g, c, "unresolved-ancestry");
        return;
      }
      uncertainty ??= "unresolved-ancestry";
    }
    if (uncertainty) {
      parent = null;
      db.prepare("INSERT OR REPLACE INTO import_uncertain_candidates VALUES (?,?,?)").run(
        g.id,
        c.path,
        uncertainty,
      );
      diagnostic(db, g, uncertainty);
    }
    db.prepare(
      "UPDATE import_candidates SET state='ready',offset=?,stamp=?,session=?,workspace=?,parent=? WHERE generation=? AND path=?",
    ).run(end + 1, JSON.stringify(source.stamp), h.id, h.cwd, parent, g.id, c.path);
    if (c.provider && !uncertainty) {
      await verifyWorkspaceAlias(db, h.cwd, workspace, realpath);
      await revalidateFile(source.file, f.roots[c.root], c.name, source.stamp);
      o.signal.throwIfAborted();
      recordConfirmedRelationship(db, {
        sessionId: h.id,
        providerIdentity: c.provider,
        workspace: h.cwd,
      });
    }
  } catch {
    if (o.signal.aborted) throw o.signal.reason;
    omit(db, g, c, source ? "source-changed" : "missing-source");
  } finally {
    if (source) await source.file.close();
    db.prepare("UPDATE import_generations SET bytes=? WHERE id=?").run(g.bytes, g.id);
  }
}
type Entry = { parent_entry: string | null; event_id: string | null };
function projectEntry(db: HistoryDatabase, g: Generation, f: Frozen, c: Candidate, value: unknown) {
  const parsed = entryIdentity(value);
  if (!parsed.success) {
    diagnostic(db, g, "invalid-record");
    return;
  }
  const e = parsed.data,
    usage = importedUsage(value, c.session!, c.workspace!, c.provider ? c.name : null);
  const uncertainty = f.includeUncertain ? uncertainCandidate(db, g.id, c.path) : undefined;
  if (uncertainty) {
    if (usage.kind === "usage") keepUncertainUsage(db, g, e.id, usage.record, uncertainty);
    else if (usage.kind === "invalid") diagnostic(db, g, "invalid-record");
    return;
  }
  const exclude = (code: "unresolved-ancestry" | "unresolved-overlap") => {
    if (usage.kind === "usage") {
      if (f.includeUncertain) keepUncertainUsage(db, g, e.id, usage.record, code);
      else excludeCompactIdentity(db, usage.record.eventId);
    }
    diagnostic(db, g, code);
  };
  let copy: Entry | undefined;
  if (c.parent) {
    const parent = db
      .prepare("SELECT * FROM import_candidates WHERE generation=? AND path=? AND state='done'")
      .get(g.id, c.parent) as Candidate | undefined;
    if (!parent || parent.workspace !== c.workspace) {
      exclude("unresolved-ancestry");
      return;
    }
    copy = db
      .prepare(
        "SELECT parent_entry,event_id FROM import_entries WHERE generation=? AND path=? AND entry=?",
      )
      .get(g.id, c.parent, e.id) as Entry | undefined;
    const prior = e.parentId
      ? db
          .prepare("SELECT 1 FROM import_entries WHERE generation=? AND path=? AND entry=?")
          .get(g.id, c.path, e.parentId)
      : null;
    if ((copy && copy.parent_entry !== e.parentId) || (!copy && (!e.parentId || !prior))) {
      exclude("unresolved-ancestry");
      return;
    }
  }
  if (
    !c.parent &&
    db
      .prepare(
        "SELECT 1 FROM import_entries e JOIN import_candidates c ON c.generation=e.generation AND c.path=e.path WHERE e.entry=? AND c.session<>? LIMIT 1",
      )
      .get(e.id, c.session)
  ) {
    exclude("unresolved-ancestry");
    return;
  }
  let eventId: string | null = copy?.event_id ?? null;
  if (usage.kind === "invalid") {
    diagnostic(db, g, "invalid-record");
    return;
  }
  if (
    usage.kind === "usage" &&
    usage.record.occurredAt >= g.start_at &&
    usage.record.occurredAt <= g.end_at
  ) {
    if (copy) {
      const original = copy.event_id ? confirmedReplay(db, copy.event_id, usage.record) : null;
      if (!original) {
        exclude("unresolved-ancestry");
        return;
      }
      eventId = original.eventId;
      g.replayed++;
    } else {
      const admission = admitImportedUsage(db, usage.record, e.id);
      if (admission.kind === "unresolved-overlap") exclude("unresolved-overlap");
      else {
        eventId = admission.owner?.eventId ?? null;
        g.records++;
      }
    }
  }
  db.prepare("INSERT OR IGNORE INTO import_entries VALUES (?,?,?,?,?)").run(
    g.id,
    c.path,
    e.id,
    e.parentId,
    eventId,
  );
}
export async function slice(
  db: HistoryDatabase,
  g: Generation,
  f: Frozen,
  c: Candidate,
  o: ImportOptions,
  budget: { bytes: number; rows: number },
) {
  let source: Awaited<ReturnType<typeof confinedFile>> | undefined;
  try {
    source = await confinedFile(f.roots[c.root], c.name, JSON.parse(c.stamp!));
    await validateFrozen(f);
    await revalidateFile(source.file, f.roots[c.root], c.name, source.stamp);
    o.signal.throwIfAborted();
    if (c.parent) {
      const parent = db
        .prepare("SELECT * FROM import_candidates WHERE generation=? AND path=? AND state='done'")
        .get(g.id, c.parent) as Candidate | undefined;
      if (!parent) throw Error("Import parent unavailable");
      const p = await confinedFile(f.roots[parent.root], parent.name, JSON.parse(parent.stamp!));
      try {
        await revalidateFile(p.file, f.roots[parent.root], parent.name, p.stamp);
      } finally {
        await p.file.close();
      }
    }
    const length = Math.min(budget.bytes, source.stamp.size - c.offset);
    if (!length) {
      db.prepare("UPDATE import_candidates SET state='done' WHERE generation=? AND path=?").run(
        g.id,
        c.path,
      );
      return;
    }
    const bytes = Buffer.alloc(length);
    o.bodyRead?.();
    const { bytesRead } = await source.file.read(bytes, 0, length, c.offset);
    g.bytes += bytesRead;
    budget.bytes -= bytesRead;
    let at = 0;
    const operations: { value?: unknown; code?: ImportDiagnostic }[] = [];
    while (at < bytesRead && budget.rows > 0) {
      const end = bytes.subarray(0, bytesRead).indexOf(10, at);
      if (end < 0) {
        if (c.dropping || bytesRead - at >= 1024 * 1024) {
          if (!c.dropping) operations.push({ code: "oversize-record" });
          c.dropping = 1;
          at = bytesRead;
        } else if (c.offset + bytesRead === source.stamp.size) {
          operations.push({ code: "invalid-record" });
          at = bytesRead;
        }
        break;
      }
      budget.rows--;
      if (c.dropping) c.dropping = 0;
      else if (end - at > 1024 * 1024) operations.push({ code: "oversize-record" });
      else {
        try {
          operations.push({ value: parseLine(bytes.subarray(at, end)) });
        } catch {
          operations.push({ code: "invalid-record" });
        }
      }
      at = end + 1;
      if (operations.length % 25 === 0) {
        await yieldWork();
        o.signal.throwIfAborted();
      }
    }
    await revalidateFile(source.file, f.roots[c.root], c.name, source.stamp);
    o.signal.throwIfAborted();
    db.transaction(() => {
      for (const op of operations) {
        o.signal.throwIfAborted();
        if (op.code) diagnostic(db, g, op.code);
        else projectEntry(db, g, f, c, op.value);
      }
      c.offset += at;
      db.prepare(
        "UPDATE import_candidates SET offset=?,dropping=?,state=? WHERE generation=? AND path=?",
      ).run(c.offset, c.dropping, c.offset === source!.stamp.size ? "done" : "ready", g.id, c.path);
      db.prepare("UPDATE import_generations SET bytes=?,records=?,replayed=? WHERE id=?").run(
        g.bytes,
        g.records,
        g.replayed,
        g.id,
      );
    });
  } catch {
    if (o.signal.aborted) throw o.signal.reason;
    omit(db, g, c, "source-changed");
  } finally {
    if (source) await source.file.close();
  }
}
