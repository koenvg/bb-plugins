import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createFixture } from "./fixture.mjs";
import { descriptionText, qualifiesContent, readFullTicket } from "./local-identity.mjs";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { JSDOM } = require("jsdom");
const task = createFixture("bbp60-navigation-lab").tasks[0];
const good = {
  rowKey: task.key,
  detailKey: task.key,
  heading: task.title,
  rowTitle: task.title,
  marker: task.marker,
  visible: true,
  rowVisible: true,
  rendered: true,
  descriptionText: descriptionText(task.description),
  linkHref: "https://example.com/benchmark",
};
test("complete matching description qualifies", () =>
  assert.equal(qualifiesContent(good, task), true));
for (const [name, patch] of Object.entries({
  wrongRow: { rowKey: "BENCH-2" },
  wrongDetail: { detailKey: "BENCH-2" },
  wrongTitle: { heading: "Wrong title" },
  wrongRowTitle: { rowTitle: "Wrong row" },
  wrongLink: { linkHref: "https://example.com/wrong" },
  missingTail: { descriptionText: good.descriptionText.slice(0, -120) },
  staleContent: { descriptionText: good.descriptionText.replace("before moving", "after moving") },
  hiddenRow: { rowVisible: false },
  hidden: { visible: false },
  unrendered: { rendered: false },
})) {
  test(`qualification rejects ${name}`, () =>
    assert.equal(qualifiesContent({ ...good, ...patch }, task), false));
}
test("nested li/p extraction counts each complete bullet once in DOM order", () => {
  const dom = new JSDOM(
    '<div data-selected="true"><span class="task-list-title">Title</span></div><div data-detail-key="BENCH-1"><div class="bb-tasks-editor" data-variant="doc"><div class="tiptap"><h2>Heading</h2><p>Intro</p><ul><li><p>First</p></li><li>Second</li></ul><p>Tail</p></div></div></div>',
  );
  const state = readFullTicket(dom.window.document, () => ({ detailKey: "BENCH-1" }));
  assert.equal(state.descriptionText, "Heading Intro First Second Tail");
  assert.equal(state.rowTitle, "Title");
  dom.window.close();
});
