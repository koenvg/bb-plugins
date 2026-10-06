"""Offline regressions for browser proof contracts. No browser or live sources."""
import copy
import json
from datetime import date, timedelta
import unittest

from preview_browser import Driver


def ax_node(node_id, role, name="", children=()):
    return {"nodeId": node_id, "ignored": False, "role": {"value": role},
            "name": {"value": name}, "childIds": list(children)}


def accessible_table(metric="cost"):
    rows = [[str(date(2026, 9, 1) + timedelta(days=index)), "$0.39813160000000003",
             "Partial, recorded usage", "2 excluded tokens",
             "1 of 60 accepted records priced; 1 priced active entities; pricing partial"]
            for index in range(30)]
    if metric == "tokens":
        rows = [[row[0], "600", *row[2:4]] for row in rows]
    headers = ["Date", "USD estimate" if metric == "cost" else "Tokens", "Coverage", "Recorded exclusions"]
    if metric == "cost":
        headers.append("Pricing")
    caption = "Daily recorded usage in UTC. Partial history."
    if metric == "cost":
        caption += " Captured estimate, not billed charges."
    nodes = [ax_node("table", "table", "Daily recorded usage", ["caption", "head", "body"]),
             ax_node("caption", "caption", children=["caption-text"]),
             ax_node("caption-text", "StaticText", caption),
             ax_node("head", "rowgroup", children=["header"]),
             ax_node("header", "row", children=[f"h-{i}" for i in range(len(headers))]),
             ax_node("body", "rowgroup", children=[f"r-{i}" for i in range(30)])]
    nodes.extend(ax_node(f"h-{i}", "columnheader", header) for i, header in enumerate(headers))
    for index, row in enumerate(rows):
        nodes.append(ax_node(f"r-{index}", "row", children=[f"c-{index}-{i}" for i in range(len(row))]))
        nodes.extend(ax_node(f"c-{index}-{i}", "rowheader" if i == 0 else "cell", value)
                     for i, value in enumerate(row))
    return rows, nodes


class AccessibilityTests(unittest.TestCase):
    def check(self, rows, nodes, metric="cost"):
        driver = Driver({"cdp": lambda *_args, **_kwargs: {"nodes": nodes}}, {"out": "/unused"})
        return driver.accessible_facts(rows, metric)

    def test_real_table_shape_passes_for_both_metrics(self):
        for metric in ["tokens", "cost"]:
            rows, nodes = accessible_table(metric)
            self.assertEqual(self.check(rows, nodes, metric)["dates"], 30)

    def test_unrelated_names_cannot_supply_missing_table_facts(self):
        rows, nodes = accessible_table()
        nodes[0]["childIds"] = []
        with self.assertRaises(AssertionError):
            self.check(rows, nodes)

    def test_misplaced_hidden_and_missing_cells_fail(self):
        rows, source = accessible_table()
        for kind in ["misplaced", "hidden", "missing"]:
            nodes = copy.deepcopy(source)
            cell = next(node for node in nodes if node["nodeId"] == "c-14-1")
            if kind == "hidden":
                cell["ignored"] = True
            elif kind == "missing":
                next(node for node in nodes if node["nodeId"] == "r-14")["childIds"].remove(cell["nodeId"])
            else:
                cell["name"]["value"] = "Unavailable"
                nodes.append(ax_node("tooltip", "StaticText", rows[14][1]))
            with self.subTest(kind=kind), self.assertRaises(AssertionError):
                self.check(rows, nodes)

    def test_wrong_caption_cannot_borrow_timezone_or_billing_limit(self):
        rows, source = accessible_table()
        for caption in ["Daily recorded usage in America/New_York. Captured estimate, not billed charges.",
                        "Daily recorded usage in UTC. Partial history."]:
            nodes = copy.deepcopy(source)
            next(node for node in nodes if node["nodeId"] == "caption-text")["name"]["value"] = caption
            nodes.append(ax_node("unrelated", "StaticText", "Daily recorded usage in UTC. Captured estimate, not billed charges."))
            with self.subTest(caption=caption), self.assertRaises(AssertionError):
                self.check(rows, nodes)

    def test_swapped_dates_and_values_fail(self):
        rows, nodes = accessible_table()
        first = next(node for node in nodes if node["nodeId"] == "c-0-0")
        last = next(node for node in nodes if node["nodeId"] == "c-29-0")
        first["name"], last["name"] = last["name"], first["name"]
        with self.assertRaises(AssertionError):
            self.check(rows, nodes)


class TooltipDriver(Driver):
    """Model browser state while using the real Driver tooltip assertion flow."""
    def __init__(self, metric="cost", hover=True, broken_facts=False):
        super().__init__({"cdp": lambda *_args, **_kwargs: {}}, {"out": "/unused"})
        self.rows, _ = accessible_table(metric)
        self.rows[13][0] = "2026-09-14"
        self.rows[14][0] = "2026-09-15"
        self.expected = self.text_for(self.rows[14], metric)
        self.text = self.expected
        self.hover = hover
        self.broken_facts = broken_facts
        self.events = []

    @staticmethod
    def text_for(row, metric):
        return "".join(TooltipDriver.lines_for(row, metric))

    @staticmethod
    def lines_for(row, metric):
        lines = [row[0], f"{'USD estimate' if metric == 'cost' else 'Tokens'}: {row[1]}", row[2]]
        if metric == "cost":
            lines.extend([row[4], "Captured estimate, not billed charges."])
        if row[3] != "0 excluded tokens":
            lines.append(row[3])
        return lines

    def table(self):
        return self.rows

    def js(self, expression):
        if ".recharts-bar-rectangle path" in expression:
            return {"x": 10, "y": 10}
        if "dispatchEvent" in expression:
            if "KeyboardEvent" in expression:
                self.events.append("keyboard")
                self.text = self.text_for(self.rows[13], "cost") if "ArrowLeft" in expression else self.expected
            elif "MouseEvent" in expression and "mousemove" in expression:
                self.events.append("pointer")
                if self.hover:
                    self.text = "2026-09-15 Unavailable" if self.broken_facts else self.expected
        if "querySelectorAll('.recharts-tooltip-wrapper p')" in expression:
            if self.text == self.expected:
                return self.lines_for(self.rows[14], "cost")
            return ["2026-09-15", "USD estimate: Unavailable"]
        if "querySelector('.recharts-tooltip-wrapper p')" in expression:
            return self.rows[14][0] if self.text == self.expected else self.rows[13][0]
        if "textContent" in expression:
            return self.text
        return None

    def wait(self, expression):
        if "includes('2026-09-15')" in expression:
            assert "2026-09-15" in self.text, "Pointer did not restore the target date"
        elif "includes('2026-09-14')" in expression:
            assert "2026-09-14" in self.text, "Tooltip did not leave the keyboard target"
        elif '!==' in expression:
            previous = json.loads(expression.split('!==', 1)[1].strip())
            assert self.text != previous, "Tooltip did not change"
        else:
            assert self.text, "Tooltip is missing"


class PointerTests(unittest.TestCase):
    def test_noop_hover_fails_instead_of_reusing_keyboard_tooltip(self):
        with self.assertRaises(AssertionError):
            TooltipDriver(hover=False).tooltip("cost")

    def test_hover_requires_exact_facts_not_only_date(self):
        with self.assertRaises(AssertionError):
            TooltipDriver(broken_facts=True).tooltip("cost")

    def test_hover_has_independent_receipt_after_state_change(self):
        driver = TooltipDriver()
        facts = driver.tooltip("cost")
        self.assertEqual(driver.events, ["keyboard", "keyboard", "pointer"])
        self.assertEqual(facts["pointer"]["row"], driver.rows[14])
        self.assertEqual(facts["pointer"]["tooltip"], driver.expected)


if __name__ == "__main__":
    unittest.main()
