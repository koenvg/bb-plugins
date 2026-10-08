import assert from "node:assert/strict";

export type Metric = "tokens" | "cost";
export type AxNode = {
  nodeId: string;
  ignored?: boolean;
  role?: { value?: string };
  name?: { value?: string };
  childIds?: string[];
};
export function accessibleFacts(
  nodes: AxNode[],
  rows: string[][],
  metric: Metric,
  timezone = "UTC",
) {
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const role = (node: AxNode) => node.role?.value;
  const name = (node: AxNode) => node.name?.value ?? "";
  function descendants(node: AxNode): AxNode[] {
    return (node.childIds ?? []).flatMap((id) => {
      const child = byId.get(id);
      assert(child, `Incomplete accessibility tree: ${id}`);
      return [...(child.ignored ? [] : [child]), ...descendants(child)];
    });
  }
  const tables = nodes.filter(
    (node) => !node.ignored && role(node) === "table" && name(node) === "Daily recorded usage",
  );
  assert.equal(tables.length, 1, "Daily facts need exactly one accessible table");
  const children = descendants(tables[0]);
  const captions = children.filter((node) => role(node) === "caption");
  assert.equal(captions.length, 1, "Daily table needs its own accessible caption");
  const caption = descendants(captions[0])
    .filter((node) => role(node) === "StaticText")
    .map(name)
    .join("");
  assert(caption.includes(`Daily recorded usage in ${timezone}.`), caption);
  if (metric === "cost")
    assert(caption.includes("Captured estimate, not billed charges."), caption);
  const axRows = children.filter((node) => role(node) === "row");
  assert.equal(rows.length, 30);
  assert.equal(axRows.length, 31, "Need header and 30 AX daily rows");
  const headers = [
    "Date",
    metric === "cost" ? "USD estimate" : "Tokens",
    "Coverage",
    "Recorded exclusions",
  ];
  if (metric === "tokens") headers.splice(2, 0, "Uncertain token estimate");
  else headers.push("Pricing");
  assert.deepEqual(
    descendants(axRows[0])
      .filter((node) => role(node) === "columnheader")
      .map(name),
    headers,
  );
  axRows.slice(1).forEach((row, index) => {
    const cells = descendants(row).filter((node) =>
      ["rowheader", "cell"].includes(role(node) ?? ""),
    );
    assert.equal(role(cells[0]), "rowheader", "Missing accessible date");
    assert.deepEqual(cells.map(name), rows[index], "Inaccessible or misplaced daily facts");
  });
  return { table: "Daily recorded usage", dates: rows.length, metric, caption };
}
export function tooltipDefinitions(row: string[], metric: Metric) {
  const definitions = [[metric === "cost" ? "USD estimate" : "Recorded tokens", row[1]]];
  if (metric === "tokens" && row[2] !== "0")
    definitions.push(["Uncertain estimate", `${row[2]} tokens`]);
  const exclusions = row[metric === "tokens" ? 4 : 3].replace(/ excluded tokens$/, "");
  if (exclusions !== "0") definitions.push(["Excluded tokens", exclusions]);
  return definitions;
}
export function verifyTooltip(
  row: string[],
  metric: Metric,
  date: string | null,
  definitions: string[][],
  lines: string[],
  fromDate?: string | null,
) {
  if (fromDate !== undefined)
    assert.notEqual(fromDate, row[0], "Hover must start from a different keyboard date");
  assert.equal(date, row[0], "Pointer did not restore the target date");
  assert.deepEqual(definitions, tooltipDefinitions(row, metric));
  assert.deepEqual(lines, []);
}
