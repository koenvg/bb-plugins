import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRealtime, useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";
import type { ProjectState, SettingsContract } from "./rpc";

export function message(error: unknown) {
  return error instanceof Error ? error.message : "Request failed";
}
interface View {
  snapshot: ProjectState;
  draft: string;
  changed: boolean;
  conflict: boolean;
}
function loaded(snapshot: ProjectState): View {
  return { snapshot, draft: snapshot.effectivePrompt, changed: false, conflict: false };
}
/** Keep the prompt baseline until the user saves or explicitly reloads it. */
function reconcile(view: View | null, next: ProjectState, holdBaseline = false): View {
  if (!view) {
    return loaded(next);
  }
  if (
    !holdBaseline &&
    !view.changed &&
    !view.conflict &&
    view.draft === view.snapshot.effectivePrompt
  ) {
    return loaded(next);
  }
  const old = view.snapshot;
  return {
    ...view,
    changed:
      view.changed ||
      next.prompt !== old.prompt ||
      next.effectivePrompt !== old.effectivePrompt ||
      next.enabled !== old.enabled ||
      next.enabledOverride !== old.enabledOverride ||
      next.enableByDefault !== old.enableByDefault,
    snapshot: {
      ...old,
      enabled: next.enabled,
      enabledOverride: next.enabledOverride,
      enableByDefault: next.enableByDefault,
    },
  };
}

export function useProjectSettings(
  projectId: string,
  sharedWriteLock?: { current: boolean },
  holdBaseline = false,
) {
  const rpc = useRpc<SettingsContract>();
  const [view, setView] = useState<View | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const baselineHeld = useRef(holdBaseline);
  useLayoutEffect(() => {
    baselineHeld.current = holdBaseline;
  }, [holdBaseline]);
  const generation = useRef(0);
  const alive = useRef(false);
  const localWriteLock = useRef(false);
  const writeLock = sharedWriteLock ?? localWriteLock;
  const readKey = useRef("");
  const activeRead = useRef(false);
  const connection = useRealtimeConnectionState();
  const previousConnection = useRef(connection);
  const discardOnRead = useRef(false);

  const refresh = useCallback((discard = false) => {
    // Invalidate responses before React starts the next effect.
    generation.current += 1;
    if (discard) {
      discardOnRead.current = true;
      setReloading(true);
    }
    setAttempt((n) => n + 1);
  }, []);
  useRealtime("settings.changed", (payload) => {
    if (!payload || typeof payload !== "object" || !("kind" in payload)) {
      return;
    }
    if (
      payload.kind === "default" ||
      (payload.kind === "project" && "projectId" in payload && payload.projectId === projectId)
    ) {
      refresh();
    }
  });
  useEffect(() => {
    if (connection === "connected" && previousConnection.current !== "connected") {
      refresh();
    }
    previousConnection.current = connection;
  }, [connection, refresh]);
  useEffect(() => {
    alive.current = true;
    readKey.current = "";
    return () => {
      alive.current = false;
      generation.current += 1;
    };
  }, []);
  useEffect(() => {
    if (!projectId || pending) {
      return;
    }
    const key = `${projectId}/${attempt}`;
    if (readKey.current === key) {
      return;
    }
    readKey.current = key;
    const request = (generation.current += 1);
    let current = true;
    activeRead.current = true;
    setReading(true);
    setReadError(null);
    const valid = () => current && alive.current && generation.current === request;
    rpc
      .call("getProject", { projectId })
      .then((result) => {
        if (!valid()) {
          return;
        }
        if (result.projectId !== projectId) {
          throw new Error("Project response did not match the selection.");
        }
        const discard = discardOnRead.current;
        discardOnRead.current = false;
        setReloading(false);
        if (discard) {
          setWriteError(null);
          setSaved(null);
        }
        const hold = baselineHeld.current;
        setView((old) => (discard ? loaded(result) : reconcile(old, result, hold)));
      })
      .catch((error) => {
        if (valid()) {
          discardOnRead.current = false;
          setReloading(false);
          setReadError(message(error));
        }
      })
      .finally(() => {
        if (valid()) {
          setReading(false);
          activeRead.current = false;
        }
      });
    return () => {
      current = false;
    };
  }, [rpc, projectId, attempt, pending]);

  const activeView = view?.snapshot.projectId === projectId ? view : null;
  const state = activeView?.snapshot ?? null;
  const draft = activeView?.draft ?? "";
  const dirty = !!state && draft !== state.effectivePrompt;
  async function persist(
    projectName: string,
    prompt: string | null,
    expected?: { prompt: string | null },
  ) {
    if (!state || writeLock.current || view?.conflict) {
      return;
    }
    const target = state.projectId;
    const refreshAfter = activeRead.current;
    const request = (generation.current += 1);
    writeLock.current = true;
    setReading(false);
    activeRead.current = false;
    setPending(true);
    setWriteError(null);
    setSaved(null);
    // Invalidation can advance generation during a write. It schedules a later read,
    // but cannot discard the confirmed result of this serialized write.
    const valid = () => alive.current && writeLock.current;
    return (async () =>
      rpc.call("setPrompt", {
        projectId: target,
        prompt,
        expectedPrompt: expected ? expected.prompt : state.prompt,
      }))()
      .then((response) => {
        if (response.state.projectId !== target) {
          throw new Error("Project response did not match the save target.");
        }
        if (!valid()) {
          return;
        }
        if (response.status === "conflict") {
          setView((old) =>
            old
              ? {
                  ...reconcile({ ...old, changed: true }, response.state),
                  changed: true,
                  conflict: true,
                }
              : old,
          );
          return;
        }
        setView(loaded(response.state));
        setSaved(
          prompt === null
            ? `Reset prompt for ${projectName} to plugin default.`
            : `Saved prompt for ${projectName}.`,
        );
        return response.state;
      })
      .catch((error: unknown) => {
        if (valid()) {
          setWriteError(message(error));
        }
      })
      .finally(() => {
        writeLock.current = false;
        if (alive.current) {
          setPending(false);
          if (refreshAfter || generation.current !== request) {
            refresh();
          }
        }
      });
  }
  function edit(text: string) {
    if (writeLock.current || discardOnRead.current) {
      return;
    }
    setView((old) => (old ? { ...old, draft: text } : old));
    setSaved(null);
    setWriteError(null);
  }
  function invalidPrompt() {
    setSaved(null);
    setWriteError("Prompt must be nonblank and at most 4096 characters.");
  }
  return {
    state,
    draft,
    dirty,
    changed: activeView?.changed ?? false,
    conflict: activeView?.conflict ?? false,
    connection,
    reading,
    readError,
    pending,
    writeError,
    saved,
    reloading,
    refresh,
    persist,
    edit,
    invalidPrompt,
  };
}
