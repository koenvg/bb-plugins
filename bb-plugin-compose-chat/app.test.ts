// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, mountPluginContentScripts } from "@get-bb/plugin-sdk/testing/app";
import appDefinition from "./app.js";
import { mountStyles } from "./styles-lifecycle.js";

const marker = "data-compose-chat";
afterEach(() => {
  document.documentElement.removeAttribute(marker);
  document.body.replaceChildren();
});

describe("Compose Chat's public content-script lifecycle", () => {
  it("registers style and voice owners without replacement UI or composer actions", async () => {
    const app = await loadPluginApp(appDefinition);
    expect(app.contentScripts).toHaveLength(2);
    expect(app.contentScripts[0]?.id).toBe("chat-styles");
    expect(app.navPanels).toHaveLength(0);
    expect(app.appOverlays).toHaveLength(1);
    expect(app.composerCustomizations).toHaveLength(0);
    expect(app.threadLists).toHaveLength(0);
    expect(app.timelineRenderers).toHaveLength(0);
  });

  it("activates only while mounted and removes the marker on disable", async () => {
    const app = await loadPluginApp(appDefinition);
    const mounted = await mountPluginContentScripts(app, { pluginId: "compose-chat" });
    expect(document.documentElement.hasAttribute(marker)).toBe(true);
    await mounted.lifecycle.dispose();
    expect(document.documentElement.hasAttribute(marker)).toBe(false);
    await mounted.lifecycle.dispose();
    expect(document.documentElement.hasAttribute(marker)).toBe(false);
  });

  it("leaves the existing input, controls, and event handlers untouched", async () => {
    document.body.innerHTML =
      '<form data-promptbox><textarea>Keep my draft</textarea><button type="button">Stop run</button></form>';
    const field = document.querySelector("textarea")!;
    const button = document.querySelector("button")!;
    let clicks = 0;
    button.addEventListener("click", () => {
      clicks += 1;
    });
    const original = document.body.innerHTML;
    const app = await loadPluginApp(appDefinition);
    const mounted = await mountPluginContentScripts(app, { pluginId: "compose-chat" });
    expect(document.querySelector("textarea")).toBe(field);
    expect(field.value).toBe("Keep my draft");
    button.click();
    expect(clicks).toBe(1);
    await mounted.lifecycle.dispose();
    expect(document.body.innerHTML).toBe(original);
  });

  it("supports disable then remount without stale attributes", () => {
    const first = new AbortController();
    const cleanup = mountStyles({ signal: first.signal });
    first.abort();
    expect(document.documentElement.hasAttribute(marker)).toBe(false);
    const second = new AbortController();
    const cleanup2 = mountStyles({ signal: second.signal });
    cleanup();
    expect(document.documentElement.hasAttribute(marker)).toBe(true);
    cleanup2();
    expect(document.documentElement.hasAttribute(marker)).toBe(false);
  });

  it("does not activate a canceled mount", () => {
    const controller = new AbortController();
    controller.abort();
    mountStyles({ signal: controller.signal })();
    expect(document.documentElement.hasAttribute(marker)).toBe(false);
  });

  it("restores a preexisting marker and preserves later changes", () => {
    document.documentElement.setAttribute(marker, "previous");
    const cleanup = mountStyles({ signal: new AbortController().signal });
    cleanup();
    expect(document.documentElement.getAttribute(marker)).toBe("previous");
    const cleanup2 = mountStyles({ signal: new AbortController().signal });
    document.documentElement.setAttribute(marker, "changed-elsewhere");
    cleanup2();
    expect(document.documentElement.getAttribute(marker)).toBe("changed-elsewhere");
  });
  it.each([null, "previous"])("activates without motion bookkeeping over %s", (previousMotion) => {
    const root = document.documentElement;
    const motionMarker = "data-compose-chat-motion";
    if (previousMotion !== null) root.setAttribute(motionMarker, previousMotion);
    const addListener = vi.spyOn(document, "addEventListener");
    const controller = new AbortController();
    try {
      const cleanup = mountStyles({ signal: controller.signal });
      expect(root.getAttribute(marker)).toBe("active");
      expect(root.getAttribute(motionMarker)).toBe(previousMotion);
      document.dispatchEvent(new Event("visibilitychange"));
      expect(root.getAttribute(marker)).toBe("active");
      expect(root.getAttribute(motionMarker)).toBe(previousMotion);
      expect(addListener.mock.calls.filter(([type]) => type === "visibilitychange")).toEqual([]);
      controller.abort();
      cleanup();
      expect(root.hasAttribute(marker)).toBe(false);
      expect(root.getAttribute(motionMarker)).toBe(previousMotion);
    } finally {
      controller.abort();
      addListener.mockRestore();
      root.removeAttribute(motionMarker);
    }
  });
});
