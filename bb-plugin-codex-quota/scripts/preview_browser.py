"""Browser Use driver. Helpers come from the approved CLI, not Playwright."""
import base64
import json
from pathlib import Path
import time

from preview_resources import validate_png


class Driver:
    def __init__(self, helpers, config):
        self.h = helpers
        self.config = config
        self.out = Path(config["out"])
        self.receipts = []

    def js(self, expression):
        return self.h["js"](expression)

    def cdp(self, method, **params):
        return self.h["cdp"](method, **params)

    def wait(self, expression):
        end = time.monotonic() + 15
        while time.monotonic() < end:
            if self.js(expression):
                return
            time.sleep(0.1)
        tooltip = self.js("document.querySelector('.recharts-tooltip-wrapper')?.textContent")
        raise AssertionError(f"Timed out: {expression}; tooltip: {tooltip}")


    def click(self, name, role="button"):
        nodes = self.cdp("Accessibility.getFullAXTree")["nodes"]
        matches = [node for node in nodes if not node.get("ignored")
                   and node.get("role", {}).get("value") == role
                   and node.get("name", {}).get("value") == name]
        assert len(matches) == 1, (role, name, len(matches))
        node = matches[0]["backendDOMNodeId"]
        self.cdp("DOM.scrollIntoViewIfNeeded", backendNodeId=node)
        quad = self.cdp("DOM.getBoxModel", backendNodeId=node)["model"]["content"]
        x, y = sum(quad[0::2]) / 4, sum(quad[1::2]) / 4
        self.js(f"document.elementFromPoint({x}, {y}).closest('button, summary, a, input[type=checkbox]').click()")

    def select(self, label, value, wait=True):
        # Deterministic DOM change. Native dropdown/OS interaction is a separate limit.
        selector = json.dumps(f'select[aria-label="{label}"]')
        self.js(f"(() => {{ const e = document.querySelector({selector}); e.value = {json.dumps(value)}; e.dispatchEvent(new Event('change', {{bubbles:true}})); }})()")
        if wait:
            self.wait(f"document.querySelector({selector}).value === {json.dumps(value)}")

    def calls(self):
        return self.js("calendarFixture.calls")

    def chart(self):
        self.wait("!!document.querySelector('.recharts-surface[role=application]')")
        self.wait("(() => { const c = document.querySelector('.recharts-responsive-container').getBoundingClientRect(); const s = document.querySelector('.recharts-surface').getBoundingClientRect(); return c.width > 250 && Math.abs(c.width - s.width) < 1; })()")

    def table(self):
        return self.js("[...document.querySelectorAll('table[aria-label=\"Daily recorded usage\"] tbody tr')].map(row => [...row.children].map(cell => cell.textContent))")

    def accessible_facts(self, rows, metric, timezone="UTC"):
        nodes = self.cdp("Accessibility.getFullAXTree")["nodes"]
        by_id = {node["nodeId"]: node for node in nodes}

        def descendants(node):
            result = []
            for child_id in node.get("childIds", []):
                assert child_id in by_id, ("Incomplete accessibility tree", child_id)
                child = by_id[child_id]
                if not child.get("ignored"):
                    result.append(child)
                result.extend(descendants(child))
            return result

        def role(node):
            return node.get("role", {}).get("value")

        def name(node):
            return node.get("name", {}).get("value", "")

        tables = [node for node in nodes if not node.get("ignored")
                  and role(node) == "table" and name(node) == "Daily recorded usage"]
        assert len(tables) == 1, "Daily facts are missing from the accessibility tree"
        table_nodes = descendants(tables[0])
        captions = [node for node in table_nodes if role(node) == "caption"]
        assert len(captions) == 1, "Daily table needs its own accessible caption"
        caption = "".join(name(node) for node in descendants(captions[0]) if role(node) == "StaticText")
        assert f"Daily recorded usage in {timezone}." in caption, caption
        if metric == "cost":
            assert "Captured estimate, not billed charges." in caption, caption
        table_rows = [node for node in table_nodes if role(node) == "row"]
        assert len(rows) == 30 and len(table_rows) == 31, "Need one header and 30 daily AX rows"
        headers = [name(node) for node in descendants(table_rows[0]) if role(node) == "columnheader"]
        expected_headers = ["Date", "USD estimate" if metric == "cost" else "Tokens", "Coverage", "Recorded exclusions"]
        if metric == "tokens":
            expected_headers.insert(2, "Uncertain token estimate")
        if metric == "cost":
            expected_headers.append("Pricing")
        assert headers == expected_headers, headers
        for ax_row, expected in zip(table_rows[1:], rows):
            cells = [node for node in descendants(ax_row) if role(node) in ["rowheader", "cell"]]
            assert cells and role(cells[0]) == "rowheader", ("Missing accessible date", expected)
            actual = [name(node) for node in cells]
            assert actual == expected, ("Inaccessible or misplaced daily facts", expected, actual)
        return {"table": "Daily recorded usage", "dates": len(rows), "metric": metric, "caption": caption}

    def tooltip(self, metric):
        self.js("document.querySelector('.recharts-wrapper').dispatchEvent(new MouseEvent('mouseout', {bubbles:true,relatedTarget:document.body}))")
        self.js("document.querySelector('.recharts-surface[role=application]').focus()")
        self.js("document.querySelector('.recharts-surface[role=application]').dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight',bubbles:true}))")
        self.wait("!!document.querySelector('.recharts-tooltip-wrapper')?.textContent")
        dates = [row[0] for row in self.table()]
        # Start from the real active date; focus and hover can retain different indices.
        for _ in range(30):
            text = self.js("document.querySelector('.recharts-tooltip-wrapper')?.textContent || ''")
            current_date = self.js("document.querySelector('.recharts-tooltip-wrapper time')?.getAttribute('datetime')")
            assert current_date in dates, ("Tooltip has no report date", current_date)
            index = dates.index(current_date)
            if index == 14:
                break
            key = 'ArrowLeft' if index > 14 else 'ArrowRight'
            self.js(f"document.querySelector('.recharts-surface[role=application]').dispatchEvent(new KeyboardEvent('keydown', {{key:{json.dumps(key)},bubbles:true}}))")
            self.wait(f"(document.querySelector('.recharts-tooltip-wrapper')?.textContent || '') !== {json.dumps(text)}")
        self.wait(f"document.querySelector('.recharts-tooltip-wrapper time')?.getAttribute('datetime') === {json.dumps(dates[14])}")
        keyboard = self.tooltip_facts(metric)
        # A no-op hover must not reuse the successful keyboard tooltip.
        bar = self.js("(() => { const e = [...document.querySelectorAll('.recharts-bar-rectangle path')].find(e => {const r=e.getBoundingClientRect(); return r.width>0 && r.height>0;}); if (!e) return null; const r = e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+Math.min(r.height/2,10)}; })()")
        pointer = None
        if bar:
            self.js("document.querySelector('.recharts-surface[role=application]').dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowLeft',bubbles:true}))")
            self.wait(f"(document.querySelector('.recharts-tooltip-wrapper')?.textContent || '') !== {json.dumps(keyboard['tooltip'])}")
            before_pointer_date = self.js("document.querySelector('.recharts-tooltip-wrapper time')?.getAttribute('datetime')")
            assert before_pointer_date in dates and before_pointer_date != dates[14]
            self.js(f"document.querySelector('.recharts-wrapper').dispatchEvent(new MouseEvent('mousemove', {{clientX:{bar['x']},clientY:{bar['y']},bubbles:true}}))")
            # Request a rendered frame so an occluded browser can process its hover RAF.
            self.cdp("Page.captureScreenshot", format="png", captureBeyondViewport=False)
            self.wait(f"document.querySelector('.recharts-tooltip-wrapper time')?.getAttribute('datetime') === {json.dumps(dates[14])}")
            pointer = self.tooltip_facts(metric)
            pointer["fromDate"] = before_pointer_date
        return {**keyboard, "pointer": pointer}

    def tooltip_facts(self, metric):
        row = self.table()[14]
        definitions = self.js("[...document.querySelectorAll('.recharts-tooltip-wrapper dl > div')].map(e => [e.querySelector('dt').textContent,e.querySelector('dd').textContent])")
        expected_definitions = [["USD estimate" if metric == "cost" else "Recorded tokens", row[1]]]
        if metric == "tokens" and row[2] != "0":
            expected_definitions.append(["Uncertain estimate", f"{row[2]} tokens"])
        exclusions = row[4 if metric == "tokens" else 3].removesuffix(" excluded tokens")
        if exclusions != "0":
            expected_definitions.append(["Excluded tokens", exclusions])
        assert definitions == expected_definitions, (expected_definitions, definitions)
        lines = self.js("[...document.querySelectorAll('.recharts-tooltip-wrapper [role=tooltip] > div p')].map(e => e.textContent)")
        expected = [row[3 if metric == "tokens" else 2]]
        if metric == "cost":
            expected.extend([row[4], "Captured estimate, not billed charges."])
        if metric == "tokens" and row[2] != "0":
            expected.append("Duplicate checks are approximate.")
        assert lines == expected, (expected, lines)
        text = self.js("document.querySelector('.recharts-tooltip-wrapper').textContent")
        return {"row": row, "tooltip": text, "lines": lines}

    def capture(self, name, width):
        self.js("window.scrollTo(0, 0)")
        data = self.cdp("Page.captureScreenshot", format="png", captureBeyondViewport=False)["data"]
        path = self.out / (name + ".png")
        path.write_bytes(base64.b64decode(data, validate=True))
        facts = validate_png(path)
        assert abs(facts["width"] - width) <= 1, facts
        return facts

    def layout(self):
        return self.js("""(() => {
          const s = document.querySelector('.recharts-surface');
          const y = [...document.querySelectorAll('.recharts-yAxis-tick-labels text')].map(e => e.textContent);
          const x = [...document.querySelectorAll('.recharts-xAxis-tick-labels text')].map(e => e.textContent);
          const label = document.querySelector('.recharts-label')?.getBoundingClientRect();
          const ticks = [...document.querySelectorAll('.recharts-yAxis-tick-labels text')].map(e => e.getBoundingClientRect());
          const bounds = s?.getBoundingClientRect();
          const tip = document.querySelector('.recharts-tooltip-wrapper [role=tooltip]')?.getBoundingClientRect();
          const tooltipContained = tip && bounds ? tip.left >= bounds.left && tip.right <= bounds.right && tip.top >= 0 && tip.bottom <= innerHeight : false;
          const axisSpacing = label && ticks.length && bounds ? {
            gap: Math.min(...ticks.map(r => r.left)) - label.right,
            contained: label.left >= bounds.left && ticks.every(r => r.left >= bounds.left)
          } : null;
          return {width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth,
            axisSpacing, tooltipContained, chartWidth: s?.getBoundingClientRect().width, x, y,
            body: document.body.innerText};
        })()""")

    def state(self, width, height, state):
        self.cdp("Emulation.setDeviceMetricsOverride", width=width, height=height, deviceScaleFactor=1, mobile=False)
        self.cdp("Emulation.setTimezoneOverride", timezoneId="UTC")
        self.h["goto_url"](self.config["base"] + "?state=" + state)
        self.h["wait_for_load"]()
        self.wait("!!window.calendarFixture && !!document.querySelector('select[aria-label=\"Codex host\"]')")
        self.wait("document.body.innerText.includes('42% remaining')")
        absent = self.js("['Report grouping','Report comparison'].every(n => !document.querySelector('[aria-label=\"'+n+'\"]')) && !document.querySelector('[aria-label=\"Daily detail\"]') && !document.body.innerText.includes('Collection and history management')")
        assert absent
        assert self.js("[...document.querySelectorAll('select[aria-label=\"Report metric\"] option')].map(e=>e.value).join(',')") == "tokens,cost"
        if state in ["unavailable", "loading", "retry"]:
            message = {"unavailable": "History storage is incompatible or unsafe.", "loading": "Loading chart…", "retry": "Selected host is offline."}[state]
            self.wait(f"document.body.innerText.includes({json.dumps(message)})")
            assert not self.js("!!document.querySelector('.recharts-surface')")
        else:
            self.chart()
        facts = []
        for metric in ["tokens", "cost"]:
            before = self.calls()
            self.select("Report metric", metric)
            assert self.calls() == before, ("Metric change sent an RPC", before, self.calls())
            if state not in ["unavailable", "loading", "retry"]:
                self.chart()
                rows = self.table()
                assert len(rows) == 30
                expected_values = {
                    "tokens": {"unknown": "Unavailable", "inactive": "0", "huge": "9,007,199,254,740,991"},
                    "cost": {"partial": "$287.24", "unknown": "Unavailable", "inactive": "Unavailable", "no-prices": "Unavailable",
                             "huge": "$9,007,199,254,740,991", "tiny": "$5e-324"},
                }
                expected = expected_values[metric].get(state, "$0.39813160000000003" if metric == "cost" else "600")
                assert rows[14][1] == expected, (state, metric, rows[14])
                assert ("Observed inactivity" if state == "inactive" else "Unknown, uncovered gap" if state == "unknown" else "Partial, recorded usage") in rows[14][3 if metric == "tokens" else 2], rows[14]
                if state not in ["inactive", "unknown"]:
                    assert rows[0][1] == "Unavailable", rows[0]
                    assert rows[14][4 if metric == "tokens" else 3] == "2 excluded tokens"
                tooltip = self.tooltip(metric)
                tooltip["accessibility"] = self.accessible_facts(rows, metric)
                facts.append(tooltip)
                layout = self.layout()
                assert len(layout["x"]) >= 2, layout
                assert layout["axisSpacing"] and layout["axisSpacing"]["gap"] >= 8, layout
                assert all(label.startswith(("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")) for label in layout["x"]), layout
                assert layout["axisSpacing"]["contained"], layout
                assert layout["tooltipContained"], layout
                if expected not in ["Unavailable", "0"]:
                    assert len(layout["y"]) >= 2, layout
                assert self.js("!!document.querySelector('.recharts-yAxis')")
                axis_name = "USD estimate" if metric == "cost" else "Tokens"
                assert axis_name in self.js("[...document.querySelectorAll('.recharts-label')].map(e=>e.textContent).join(' ')")
                assert self.js("document.querySelector('button[aria-label=\"Next 30 days\"]').disabled")
            assert not self.js("!!document.querySelector('input[type=checkbox]')")
            assert not self.js("!!document.querySelector('[aria-label=\"Estimated token summary\"]')")
            assert not self.js("document.body.innerText.includes('Preparing history. The chart remains available.')")
            if state == "partial" and metric == "tokens":
                assert [call for call in self.calls() if call["method"] == "calendarReport"][-1]["input"]["query"]["includeUncertain"] is True
                assert self.table()[14][2] == "300"
                assert self.js("!!document.querySelector('.recharts-bar-rectangle path[stroke-dasharray]')")
            layout = self.layout()
            assert not layout["overflow"], layout
            self.capture(f"{self.config['suite']}-{width}-{state}-{metric}", width)
        self.interactions(state)
        # The link is keyboard-focusable, but no external navigation is authorized.
        assert self.js("(() => {const e=document.querySelector('a[aria-label=\"Open Codex Usage\"]'); e.focus(); return document.activeElement===e && e.href==='https://chatgpt.com/codex/settings/usage';})()")
        calls = self.calls()
        assert all(call["method"] in ["selection", "selectHost", "read", "calendarReport", "activity", "historyReadiness", "historicalImport"] for call in calls)
        for call in calls:
            if call["method"] == "calendarReport":
                query = call["input"]["query"]
                assert query["group"] == "workspace" and query["scope"] == {"kind": "host"}
                assert not query.get("comparison")
        assert not self.js("calendarFixture.errors"), self.js("calendarFixture.errors")
        self.receipts.append({"width": width, "state": state, "facts": facts, "calls": calls, "layout": self.layout()})

    def interactions(self, state):
        if state == "partial" and self.config["suite"] == "calendar":
            start = len(self.calls())
            for date in ["2026-08-03", "2026-07-04"]:
                self.click("Previous 30 days")
                self.wait(f"document.querySelector('table')?.textContent.includes('{date}')")
            assert self.js("document.querySelector('button[aria-label=\"Previous 30 days\"]').disabled")
            for date in ["2026-08-03", "2026-09-02"]:
                self.click("Next 30 days")
                self.wait(f"document.querySelector('table')?.textContent.includes('{date}')")
            assert [c["method"] for c in self.calls()[start:]] == ["calendarReport"] * 4
        if state == "retry":
            start = len(self.calls())
            self.click("Retry chart")
            self.chart()
            assert [c["method"] for c in self.calls()[start:]] == ["calendarReport"]
        if state == "stale":
            start = len(self.calls())
            self.click("Refresh chart")
            self.wait("document.body.innerText.includes('Chart is out of date.') && ![...document.querySelectorAll('button')].find(e=>e.textContent==='Refresh chart').disabled")
            assert [c["method"] for c in self.calls()[start:]] == ["calendarReport"]
            assert self.table()[14][1] not in ["Unavailable", "0"]
        if state in ["latest", "cancel"]:
            self.click("Previous 30 days")
            self.wait("calendarFixture.calls.filter(c=>c.method==='calendarReport').length===2")
            if state == "cancel":
                assert not self.js("!!document.querySelector('table')")
            else:
                self.chart()
            self.select("Codex host", "host_b")
            if state == "latest":
                self.wait("document.body.innerText.includes('outside the retained bounds')")
                start = len(self.calls())
                self.click("Latest 30 days")
                self.chart()
                assert self.table()[0][0] == "2026-09-02"
                assert [c["method"] for c in self.calls()[start:]] == ["calendarReport"]
            else:
                self.chart()
                before = self.table()
                self.click("Release pending responses")
                time.sleep(0.2)
                assert self.table() == before
                assert self.calls()[-1]["input"]["hostId"] == "host_b"
        if state == "selection":
            self.select("Codex host", "host_b", wait=False)
            self.wait("document.body.innerText.includes('Changing host.')")
            assert not self.js("!!document.querySelector('table')")
            self.click("Release pending responses")
            self.chart()
            assert self.calls()[-1]["input"]["hostId"] == "host_b"
        if state == "settings":
            assert not any(c["method"] in ["historyReadiness", "activity", "historicalImport"] for c in self.calls())
            self.click("Show usage settings")
            self.wait("!!document.querySelector('[aria-label=\"Usage collection settings\"]')")
            assert not any(c["method"] in ["historyReadiness", "historicalImport"] for c in self.calls())
            self.click("Collection and history management", "DisclosureTriangle")
            self.wait("calendarFixture.pending()===2")
            self.click("Collection and history management", "DisclosureTriangle")
            self.wait("!document.querySelector('[aria-label=\"History readiness\"]')")
            self.select("Codex host", "host_b")
            self.wait("calendarFixture.calls.some(c=>c.method==='selectHost')")
            self.click("Release pending responses")
            time.sleep(0.2)
            assert not self.js("document.body.innerText.includes('History not configured on this host.')")
            self.click("Collection and history management", "DisclosureTriangle")
            self.wait("calendarFixture.pending()===2")
            self.click("Release pending responses")
            self.wait("document.body.innerText.includes('History not configured on this host.')")
            management = [c for c in self.calls() if c["method"] in ["historyReadiness", "historicalImport"]]
            assert len(management) == 4 and all(c["input"]["hostId"] == "host_b" for c in management[2:])
            self.click("Show chart")
            self.chart()


def check(helpers, config):
    driver = Driver(helpers, config)
    # Inspect connection without touching its selected target or exposing unrelated URLs.
    previous = helpers["current_tab"]()["targetId"]
    existing = {tab["targetId"] for tab in helpers["list_tabs"]()}
    target = helpers["new_tab"]()
    if isinstance(target, dict):
        target = target.get("targetId", target.get("target_id"))
    assert target and target not in existing, "New tab did not establish ownership"
    record = {"token": config["token"], "target": target, "previous": previous, "closed": False}
    owner_path = driver.out / "browser-owned.json"
    owner_path.write_text(json.dumps(record, indent=2))
    try:
        helpers["switch_tab"](target)
        for width, height in [(1280, 1100), (375, 812)]:
            for state in config["states"]:
                driver.state(width, height, state)
        (driver.out / "checks.json").write_text(json.dumps(driver.receipts, indent=2))
    finally:
        # Only the recorded task-created tab can be reset or closed.
        assert json.loads(owner_path.read_text()) == record
        helpers["switch_tab"](target)
        assert helpers["current_tab"]()["targetId"] == target
        driver.cdp("Emulation.clearDeviceMetricsOverride")
        driver.cdp("Emulation.setTimezoneOverride", timezoneId="")
        helpers["close_tab"](target)
        remaining = {tab["targetId"] for tab in helpers["list_tabs"]()}
        close_deadline = time.monotonic() + 5
        while target in remaining and time.monotonic() < close_deadline:
            time.sleep(0.05)
            remaining = {tab["targetId"] for tab in helpers["list_tabs"]()}
        record["closed"] = target not in remaining
        owner_path.write_text(json.dumps(record, indent=2))
        assert record["closed"]
        if previous in remaining:
            helpers["switch_tab"](previous)
    print(f"Verified {len(driver.receipts)} synthetic SDK browser states; owned tab closed.")
