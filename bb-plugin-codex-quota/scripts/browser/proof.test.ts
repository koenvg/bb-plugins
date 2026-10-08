import { test, expect } from "vitest";
import {
  accessibleFacts,
  tooltipDefinitions,
  verifyTooltip,
  type AxNode,
  type Metric,
} from "./proof.js";

function table(metric: Metric = "cost") {
  const node = (nodeId: string, role: string, name = "", childIds: string[] = []): AxNode => ({
    nodeId,
    ignored: false,
    role: { value: role },
    name: { value: name },
    childIds,
  });
  const rows = Array.from({ length: 30 }, (_, index) => {
    const date = `2026-09-${String(index + 1).padStart(2, "0")}`;
    return metric === "cost"
      ? [
          date,
          "$0.39813160000000003",
          "Partial, recorded usage",
          "2 excluded tokens",
          "1 of 60 accepted records priced; 1 priced active entities; pricing partial",
        ]
      : [date, "600", "350", "Partial, recorded usage", "2 excluded tokens"];
  });
  const headers = [
    "Date",
    metric === "cost" ? "USD estimate" : "Tokens",
    "Coverage",
    "Recorded exclusions",
  ];
  if (metric === "cost") headers.push("Pricing");
  else headers.splice(2, 0, "Uncertain token estimate");
  const nodes = [
    node("table", "table", "Daily recorded usage", ["caption", "head", "body"]),
    node("caption", "caption", "", ["caption-text"]),
    node(
      "caption-text",
      "StaticText",
      `Daily recorded usage in UTC. Partial history.${metric === "cost" ? " Captured estimate, not billed charges." : ""}`,
    ),
    node("head", "rowgroup", "", ["header"]),
    node(
      "header",
      "row",
      "",
      headers.map((_, i) => `h-${i}`),
    ),
    node(
      "body",
      "rowgroup",
      "",
      rows.map((_, i) => `r-${i}`),
    ),
    ...headers.map((value, i) => node(`h-${i}`, "columnheader", value)),
  ];
  rows.forEach((row, index) => {
    nodes.push(
      node(
        `r-${index}`,
        "row",
        "",
        row.map((_, i) => `c-${index}-${i}`),
      ),
    );
    nodes.push(
      ...row.map((value, i) => node(`c-${index}-${i}`, i === 0 ? "rowheader" : "cell", value)),
    );
  });
  return { rows, nodes };
}
for (const metric of ["tokens", "cost"] as const) {
  test(`${metric} AX own descendants exact facts`, () => {
    const { rows, nodes } = table(metric);
    expect(accessibleFacts(nodes, rows, metric).dates).toBe(30);
  });
  test(`${metric} independent hover exact receipt`, () => {
    const row = table(metric).rows[14];
    expect(() =>
      verifyTooltip(row, metric, row[0], tooltipDefinitions(row, metric), [], "2026-09-14"),
    ).not.toThrow();
    expect(() =>
      verifyTooltip(row, metric, "2026-09-14", tooltipDefinitions(row, metric), [], "2026-09-14"),
    ).toThrow(/restore the target date/);
    expect(() =>
      verifyTooltip(row, metric, row[0], [["USD estimate", "Unavailable"]], [], "2026-09-14"),
    ).toThrow();
    expect(() =>
      verifyTooltip(row, metric, row[0], tooltipDefinitions(row, metric), [], row[0]),
    ).toThrow(/different keyboard date/);
  });
}
test("unrelated AX names cannot supply a table caption or facts", () => {
  const { rows, nodes } = table();
  nodes[0].childIds = [];
  expect(() => accessibleFacts(nodes, rows, "cost")).toThrow();
});
for (const kind of ["misplaced", "hidden", "missing", "incomplete"]) {
  test(`AX ${kind} cell fails`, () => {
    const { rows, nodes } = table();
    const cell = nodes.find((node) => node.nodeId === "c-14-1")!;
    if (kind === "hidden") cell.ignored = true;
    else if (kind === "missing")
      nodes.find((node) => node.nodeId === "r-14")!.childIds!.splice(1, 1);
    else if (kind === "incomplete") nodes.splice(nodes.indexOf(cell), 1);
    else {
      cell.name!.value = "Unavailable";
      nodes.push({
        nodeId: "unrelated",
        role: { value: "StaticText" },
        name: { value: rows[14][1] },
      });
    }
    expect(() => accessibleFacts(nodes, rows, "cost")).toThrow();
  });
}
for (const caption of [
  "Daily recorded usage in America/New_York. Captured estimate, not billed charges.",
  "Daily recorded usage in UTC. Partial history.",
]) {
  test(`AX wrong caption ${caption}`, () => {
    const { rows, nodes } = table();
    nodes.find((node) => node.nodeId === "caption-text")!.name!.value = caption;
    nodes.push({
      nodeId: "unrelated",
      role: { value: "StaticText" },
      name: { value: "Daily recorded usage in UTC. Captured estimate, not billed charges." },
    });
    expect(() => accessibleFacts(nodes, rows, "cost")).toThrow();
  });
}
test("AX swapped dates fail", () => {
  const { rows, nodes } = table();
  const first = nodes.find((node) => node.nodeId === "c-0-0")!;
  const last = nodes.find((node) => node.nodeId === "c-29-0")!;
  [first.name, last.name] = [last.name, first.name];
  expect(() => accessibleFacts(nodes, rows, "cost")).toThrow();
});
