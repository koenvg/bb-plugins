import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import type { OutputSnapshotHook } from "./use-output-snapshot";

type Target = { button: HTMLButtonElement; container: HTMLSpanElement };
const itemSelector = '[data-footer-item="plugin:live-output/rate"]';
const triggerSelector = `${itemSelector} button[data-sidebar="menu-button"]`;

function RateBadges({
  targets,
  useSnapshot,
}: {
  targets: Target[];
  useSnapshot: OutputSnapshotHook;
}) {
  const { snapshot, disconnected } = useSnapshot();
  const ready = snapshot && !disconnected && snapshot.coverage !== "starting";
  const rate = ready
    ? (snapshot.smoothBytesPerSecond / 4).toLocaleString(undefined, { maximumFractionDigits: 1 })
    : "—";
  const description = ready
    ? `${rate} estimated tokens per second, thirty-second average${snapshot.coverage === "degraded" ? ", incomplete coverage" : ""}`
    : "Live output rate unavailable";
  return targets.map(({ container }) =>
    createPortal(
      <span title={description}>
        <span aria-hidden="true" className="whitespace-nowrap text-[10px] tabular-nums">
          {rate} tok/s
        </span>
        <span className="sr-only">{description}</span>
      </span>,
      container,
      container.id,
    ),
  );
}

// The public footer registration supplies only an icon/action, not a live label.
// Keep the BB 0.46 DOM attachment here, as Codex Quota does, without replacing host children.
export function createOutputFooter(useSnapshot: OutputSnapshotHook) {
  let open: (() => void) | null = null;
  let pending = false;
  function Overlay() {
    const navigate = useBbNavigate();
    const id = useId();
    const [targets, setTargets] = useState<Target[]>([]);
    useEffect(() => {
      const action = () => navigate.toPluginPanel("live-output");
      open = action;
      if (pending) {
        pending = false;
        action();
      }
      return () => {
        if (open === action) {
          open = null;
          pending = false;
        }
      };
    }, [navigate]);
    useEffect(() => {
      const attached = new Map<HTMLButtonElement, Target>();
      let serial = 0;
      const release = ({ button, container }: Target) => {
        container.remove();
        const descriptions = (button.getAttribute("aria-describedby") ?? "")
          .split(/\s+/)
          .filter((token) => token && token !== container.id);
        if (descriptions.length) button.setAttribute("aria-describedby", descriptions.join(" "));
        else button.removeAttribute("aria-describedby");
      };
      const reconcile = () => {
        const buttons = new Set(
          Array.from(document.querySelectorAll<HTMLButtonElement>(triggerSelector)),
        );
        let changed = false;
        for (const [button, target] of attached) {
          if (!buttons.has(button) || target.container.parentElement !== button) {
            release(target);
            attached.delete(button);
            changed = true;
          }
        }
        for (const button of buttons) {
          if (!attached.has(button)) {
            const container = document.createElement("span");
            container.id = `${id}-rate-${++serial}`;
            container.setAttribute("data-live-output-rate", "");
            // Keep pointer clicks on the host button, not the overlay's portal ancestry.
            container.style.pointerEvents = "none";
            button.append(container);
            attached.set(button, { button, container });
            changed = true;
          }
          const container = attached.get(button)!.container;
          const descriptions = (button.getAttribute("aria-describedby") ?? "")
            .split(/\s+/)
            .filter(Boolean);
          if (!descriptions.includes(container.id))
            button.setAttribute("aria-describedby", [...descriptions, container.id].join(" "));
        }
        if (changed) setTargets([...attached.values()]);
      };
      const observer = new MutationObserver((records) => {
        if (
          records.some((record) => {
            const element =
              record.target.nodeType === 1
                ? (record.target as Element)
                : record.target.parentElement;
            if (element?.closest("[data-live-output-rate]")) return false;
            if (element?.closest(itemSelector)) return true;
            if (record.type === "attributes" && record.attributeName === "data-footer-item")
              return true;
            return [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(
              (node) =>
                node instanceof Element &&
                (node.matches(itemSelector) || node.querySelector(itemSelector)),
            );
          })
        )
          reconcile();
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-footer-item", "aria-describedby"],
      });
      reconcile();
      return () => {
        observer.disconnect();
        for (const target of attached.values()) release(target);
      };
    }, [id]);
    return (
      <>
        <style>{`${triggerSelector} { width: auto; gap: 4px; }`}</style>
        {targets.length > 0 && <RateBadges targets={targets} useSnapshot={useSnapshot} />}
      </>
    );
  }
  return {
    component: Overlay,
    activate: () => {
      if (open) open();
      else pending = true;
    },
  };
}
