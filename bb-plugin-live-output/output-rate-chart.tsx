import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { areaY, crosshair, defineChart, lineY, ruleY } from "@tanstack/charts";
import type {
  ChartRendererHost,
  ChartRendererRenderContext,
  ChartTooltipBodyTarget,
  DomChartDefinition,
} from "@tanstack/charts";
import { createChartCursor, cursorHost } from "@tanstack/charts/cursor";
import { decorative } from "@tanstack/charts/mark/decorative";
import { mountChartRenderer } from "@tanstack/charts/renderer";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { createSvgChartRenderer } from "@tanstack/charts/svg/renderer";
import { tooltip } from "@tanstack/charts/tooltip";
import { portal } from "@tanstack/charts/tooltip/portal";
import type { OutputRateView, RatePoint } from "./output-rate";

type Availability = "connected" | "stale";
type Body = ChartTooltipBodyTarget<RatePoint, number, number>;
type Axes = readonly { value: number; top: number }[];
const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 });
const waitingPoints: readonly RatePoint[] = Array.from({ length: 600 }, (_, second) => ({
  second,
  value: 0,
  observation: "before-start",
}));
const help =
  "Use Left/Right to step through samples, Home/End for the edges, and Escape to dismiss the tooltip. Enter and Space use native chart handling when a point is inspected.";
const styles = `
.live-output-rate-surface { height:15rem; width:100%; color:var(--primary); }
.live-output-rate-surface svg { display:block; }
.live-output-rate-surface svg:focus-visible { outline:2px solid var(--ring); outline-offset:2px; }
.live-output-rate-tooltip { --ts-chart-tooltip-max-width:min(240px, calc(100vw - 32px)); }
[data-bb-plugin="live-output"].live-output-rate-readout { box-sizing:border-box; max-width:min(240px, calc(100vw - 32px)); padding:8px; border:1px solid var(--border, CanvasText); border-radius:6px; background:var(--popover, Canvas); color:var(--popover-foreground, CanvasText); box-shadow:var(--shadow-md, 0 6px 24px rgb(0 0 0 / .14)); font:400 12px/1.4 var(--font-sans, system-ui, sans-serif); font-variant-numeric:tabular-nums; overflow-wrap:anywhere; pointer-events:none; }
.live-output-rate-readout time,.live-output-rate-readout span { display:block; }
.live-output-rate-readout time,.live-output-rate-readout span:last-child { color:var(--muted-foreground, currentColor); }
.live-output-rate-readout strong { font-weight:500; }
`;

function mountOutputView(
  container: HTMLDivElement,
  initialView: OutputRateView,
  initialAvailability: Availability,
  publishBody: (body: Body | null) => void,
  publishAxes: (axes: Axes) => void,
) {
  const cursor = createChartCursor<number, number>();
  const renderer = createSvgChartRenderer<RatePoint, number, number>();
  let view = initialView;
  let availability = initialAvailability;
  let pendingLatest = false;
  let host: ChartRendererHost<RatePoint, number, number> | undefined;
  let surface: Element | undefined;
  let detachSurface = () => {};
  let escapeBound = false;
  let destroyed = false;
  const bodyChange = (body: Body | null) => {
    if (!destroyed) publishBody(body);
  };
  const document = container.ownerDocument;
  const available = () => availability === "connected" && view.history.kind === "history";
  const points = () => (view.history.kind === "history" ? view.history.points : waitingPoints);
  const dismiss = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      pendingLatest = false;
      cursor.setState(null);
    }
  };
  function syncEscape() {
    const state = cursor.getState();
    const visible =
      available() &&
      state?.anchor === "value" &&
      points().some((point) => point.second === state.value.x);
    if (visible && !escapeBound) {
      document.addEventListener("keydown", dismiss, true);
      escapeBound = true;
    } else if (!visible && escapeBound) {
      document.removeEventListener("keydown", dismiss, true);
      escapeBound = false;
    }
  }
  function latest() {
    cursor.setState({
      anchor: "value",
      value: { x: points().at(-1)!.second },
      source: "programmatic",
      pinned: false,
    });
  }
  function attach(context: ChartRendererRenderContext<RatePoint, number, number>) {
    const element = context.surface.defaultElement ?? context.surface.element;
    if (surface !== element) {
      detachSurface();
      surface = element;
      const focus = () => {
        if (available()) latest();
        else pendingLatest = true;
      };
      const blur = () => {
        pendingLatest = false;
        cursor.setState(null);
      };
      const key = (event: Event) => {
        const keyboard = event as KeyboardEvent;
        dismiss(keyboard);
        if (available() && !cursor.getState() && ["ArrowLeft", "ArrowRight"].includes(keyboard.key))
          latest();
      };
      const leave = () => {
        const state = cursor.getState();
        if (document.activeElement === element && state) cursor.setState({ ...state });
      };
      element.addEventListener("focus", focus, true);
      element.addEventListener("blur", blur, true);
      element.addEventListener("keydown", key, true);
      container.addEventListener("mouseleave", leave, true);
      detachSurface = () => {
        element.removeEventListener("focus", focus, true);
        element.removeEventListener("blur", blur, true);
        element.removeEventListener("keydown", key, true);
        container.removeEventListener("mouseleave", leave, true);
      };
    }
    publishAxes(
      [0, view.maximum / 2, view.maximum].map((value) => ({
        value,
        top: (context.scene.scales.y.map(value) / context.scene.height) * 100,
      })),
    );
    syncEscape();
  }
  const unsubscribe = cursor.subscribe(syncEscape);
  function definition(): DomChartDefinition<RatePoint, number, number> {
    const data = points();
    const line = lineY(data, {
      id: "output-rate",
      key: "second",
      x: "second",
      y: "value",
      stroke: "currentColor",
      strokeWidth: 2,
      lineJoin: "round",
    });
    return defineChart({
      marks: [
        decorative(
          ruleY([0, view.maximum / 2, view.maximum], {
            stroke: "var(--muted-foreground)",
            strokeOpacity: 0.2,
          }),
        ),
        decorative(
          areaY(data, { x: "second", y1: 0, y2: "value", fill: "currentColor", fillOpacity: 0.12 }),
        ),
        available() ? line : decorative(line),
        crosshair({ x: true, y: false, strokeDasharray: "4 4" }),
      ],
      scales: {
        x: {
          scale: scaleLinear().domain([data[0]!.second, data.at(-1)!.second]),
          axis: false,
          nice: false,
        },
        y: { scale: scaleLinear().domain([0, view.maximum]), axis: false, nice: false },
      },
      margin: { left: 0, right: 0, top: 30, bottom: 50 },
      svgAnimation: false,
      focus: available() ? "nearest-x" : false,
      pointer: available(),
      keyboard: true,
      maxFocusDistance: Infinity,
      focusRing: { radius: 4, fill: "currentColor", strokeWidth: 0 },
      cursor: { use: cursorHost, controller: cursor, mode: "focus", match: "x", pin: false },
      tooltip: available()
        ? {
            use: tooltip,
            portal,
            sticky: false,
            anchor: "point",
            placement: "auto",
            className: "live-output-rate-tooltip",
            content: (selected) => {
              const point = selected[0]!.datum;
              return {
                title: new Date(point.second * 1000).toISOString(),
                rows: [
                  {
                    label: view.windowLabel,
                    value:
                      point.observation === "before-start"
                        ? "Before collection started"
                        : `${format(point.value)} ${view.unitLabel}`,
                  },
                ],
              };
            },
          }
        : false,
    });
  }
  function update(next: OutputRateView, nextAvailability: Availability) {
    const wasAvailable = available();
    view = next;
    availability = nextAvailability;
    const state = cursor.getState();
    if (state?.anchor === "value" && !points().some((point) => point.second === state.value.x))
      cursor.setState(null);
    else if (wasAvailable && !available() && state) cursor.setState({ ...state });
    syncEscape();
    const options = {
      definition: definition(),
      renderer,
      ariaLabel: `Observed output over the last ten minutes in ${view.unitLabel}`,
      ariaDescription: help,
      onRender: attach,
      onFocusChange: syncEscape,
      onTooltipBodyChange: bodyChange,
    };
    if (host) host.update(options);
    else host = mountChartRenderer(container, options);
    if (available() && pendingLatest) {
      pendingLatest = false;
      latest();
    }
    syncEscape();
  }
  update(view, availability);
  return {
    update,
    destroy() {
      destroyed = true;
      detachSurface();
      unsubscribe();
      if (escapeBound) document.removeEventListener("keydown", dismiss, true);
      host?.destroy();
    },
  };
}

export function OutputRateChart({
  view,
  availability,
}: {
  view: OutputRateView;
  availability: Availability;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mounted = useRef<ReturnType<typeof mountOutputView> | null>(null);
  const [body, setBody] = useState<Body | null>(null);
  const [axes, setAxes] = useState<Axes>([]);
  useLayoutEffect(() => {
    if (mounted.current) mounted.current.update(view, availability);
    else
      mounted.current = mountOutputView(container.current!, view, availability, setBody, setAxes);
  }, [view, availability]);
  useLayoutEffect(
    () => () => {
      mounted.current?.destroy();
      mounted.current = null;
    },
    [],
  );
  const point = body?.primaryPoint?.datum;
  return (
    <div className="relative mt-4" style={{ position: "relative" }}>
      <style>{styles}</style>
      <div ref={container} className="live-output-rate-surface" />
      <div
        data-output-axes=""
        className="pointer-events-none absolute inset-0 text-muted-foreground tabular-nums"
        style={{
          fontSize: "0.875rem",
          lineHeight: 1.25,
          pointerEvents: "none",
          position: "absolute",
          inset: 0,
        }}
      >
        {axes.map(({ value, top }) => (
          <span
            key={value}
            style={{
              position: "absolute",
              left: 0,
              top: `${top}%`,
              transform: "translateY(calc(-100% - 6px))",
            }}
          >
            {format(value)}
          </span>
        ))}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span style={{ maxWidth: "48%" }}>10 minutes ago</span>
          <span style={{ maxWidth: "48%", textAlign: "right" }}>Last complete second</span>
        </div>
      </div>
      {body && point
        ? createPortal(
            <div data-bb-plugin="live-output" className="live-output-rate-readout">
              <time dateTime={new Date(point.second * 1000).toISOString()}>
                {new Date(point.second * 1000).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </time>
              <strong>
                {point.observation === "before-start"
                  ? "Before collection started"
                  : `${format(point.value)} ${view.unitLabel}`}
              </strong>
              <span>{view.windowLabel}</span>
            </div>,
            body.element,
          )
        : null}
    </div>
  );
}
