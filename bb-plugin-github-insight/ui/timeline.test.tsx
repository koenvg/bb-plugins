// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { ActionResult, rpcContract, TimelineResult } from "../contract";
import { parseTimelinePage, type TimelineEvent } from "../core/timeline";
import timelines from "../test/fixtures/pr-timelines.json";
import { TimelineSections } from "./timeline";

class Unobserved {
  observe() {}
  disconnect() {}
}

beforeAll(() => vi.stubGlobal("ResizeObserver", Unobserved));

afterEach(cleanup);

type LoadedTimeline = Extract<TimelineResult, { kind: "ok" }>;

function page(fixture: keyof typeof timelines, olderCursor: string | null = null): LoadedTimeline {
  return { kind: "ok", ...parseTimelinePage(timelines[fixture]), olderCursor };
}

function withEvents(events: TimelineEvent[], olderCursor: string | null = null): LoadedTimeline {
  return { ...page("cli-14578"), events, olderCursor };
}

const at = "2026-10-01T10:00:00Z";
const comment = (id: string, body: string): TimelineEvent => ({
  kind: "comment",
  id,
  actor: "alice",
  at,
  body,
  url: `https://github.com/o/r/pull/1#issuecomment-${id}`,
});

interface Handlers {
  getTimeline?: (input: { before: string | null }) => TimelineResult | Promise<TimelineResult>;
  addPrComment?: () => ActionResult | Promise<ActionResult>;
}

function renderTimeline(handlers: Handlers | TimelineResult, refreshedAt = 1) {
  const { getTimeline, addPrComment } =
    "kind" in handlers ? { getTimeline: () => handlers, addPrComment: undefined } : handlers;
  return renderSlot<{ threadId: string; refreshedAt: number }, typeof rpcContract>(
    { component: TimelineSections },
    { threadId: "thr_1", refreshedAt },
    {
      rpc: {
        getTimeline: getTimeline ?? (() => page("cli-14578")),
        addPrComment: addPrComment ?? (() => ({ kind: "ok" })),
      } as never,
    },
  );
}

type Slot = ReturnType<typeof renderTimeline>;

function events(slot: Slot) {
  const list = slot.getByRole("region", { name: "Conversation" }).querySelector("ol");
  return Array.from(
    list?.querySelectorAll(":scope > [data-rail-item=event]") ?? [],
  ) as HTMLElement[];
}

async function loaded(slot: Slot) {
  await vi.waitFor(() => expect(events(slot).length).toBeGreaterThan(0));
}

function timelineCalls(slot: Slot) {
  return slot.inspection.rpcCalls
    .filter((call) => call.method === "getTimeline")
    .map((call) => call.input);
}

describe("conversation timeline", () => {
  it("reads the newest events of its thread", async () => {
    const slot = renderTimeline(page("cli-14578"));

    await loaded(slot);

    expect(timelineCalls(slot)).toEqual([{ threadId: "thr_1", before: null }]);
  });

  it("shows the events oldest first, with commits in a row as one entry", async () => {
    const slot = renderTimeline(page("cli-14578"));
    await loaded(slot);

    const texts = events(slot).map((item) => item.textContent ?? "");

    expect(texts[0]).toMatch(/williammartin added 1 commit/);
    expect(texts[1]).toMatch(/copilot-pull-request-reviewer\s*Commented/);
    expect(texts[2]).toMatch(/BagToad\s*commented/);
    expect(texts[3]).toMatch(/added 2 commits/);
    expect(texts.at(-1)).toMatch(/williammartin merged/);
  });

  it("shows a comment body as Markdown with a link to GitHub", async () => {
    const body = "Use this:\n\n```ts\nconst a = 1;\n```";
    const slot = renderTimeline(withEvents([comment("1", body)]));

    await loaded(slot);
    const item = events(slot)[0]!;

    expect(within(item).getByTestId("bb-markdown").textContent).toBe(body);
    expect(within(item).getByRole("link").getAttribute("href")).toBe(
      "https://github.com/o/r/pull/1#issuecomment-1",
    );
  });

  it("shows a review verdict, body, and the number of inline comments", async () => {
    const review: TimelineEvent = {
      kind: "review",
      id: "R1",
      actor: "bob",
      at,
      state: "changes_requested",
      body: "Split this",
      url: "https://github.com/o/r/pull/1#pullrequestreview-1",
      inlineCount: 3,
      inlineCommentIds: ["C1", "C2", "C3"],
    };
    const slot = renderTimeline(withEvents([review]));

    await loaded(slot);
    const item = events(slot)[0]!;

    expect(within(item).getByText("Changes requested")).toBeTruthy();
    expect(within(item).getByText("Split this")).toBeTruthy();
    expect(within(item).getByRole("button", { name: "3 inline comments" })).toBeTruthy();
  });

  it("shows an approval without a body or inline comments", async () => {
    const slot = renderTimeline(page("cli-14578"));
    await loaded(slot);

    const approval = events(slot).find((item) => /Approved/.test(item.textContent ?? ""))!;

    expect(within(approval).queryByRole("button")).toBeNull();
  });

  it("expands a commit group to its commits", async () => {
    const slot = renderTimeline(page("cli-14507"));
    await loaded(slot);
    const group = events(slot).find((item) => /added 6 commits/.test(item.textContent ?? ""))!;

    fireEvent.click(within(group).getByText(/added 6 commits/));

    const commits = within(group).getAllByTestId("timeline-commit");
    expect(commits).toHaveLength(6);
    expect(commits[0]!.textContent).toMatch(/^[0-9a-f]{7}/);
  });

  it("shows closed and reopened events", async () => {
    const slot = renderTimeline(page("cli-13390"));
    await loaded(slot);

    const texts = events(slot).map((item) => item.textContent ?? "");

    expect(texts).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/github-actions closed/),
        expect.stringMatching(/babakks reopened/),
      ]),
    );
  });

  it("shows a ready for review event", async () => {
    const slot = renderTimeline(page("cli-14578"));
    await loaded(slot);

    expect(
      events(slot).some((item) => /marked this ready for review/.test(item.textContent ?? "")),
    ).toBe(true);
  });

  it("says when the PR has no conversation", async () => {
    const slot = renderTimeline(withEvents([]));

    expect(await slot.findByText("No conversation yet")).toBeTruthy();
  });

  it("shows a read failure with a retry that reads again", async () => {
    let result: TimelineResult = { kind: "error", message: "rate limited" };
    const slot = renderTimeline({ getTimeline: () => result });

    const alert = await slot.findByRole("alert");
    expect(alert.textContent).toContain("rate limited");
    result = withEvents([comment("1", "Back again")]);
    await act(async () => fireEvent.click(within(alert).getByRole("button", { name: "Retry" })));

    expect(await slot.findByText("Back again")).toBeTruthy();
    expect(timelineCalls(slot)).toHaveLength(2);
  });

  it("loads older events above the newest ones", async () => {
    const slot = renderTimeline({
      getTimeline: ({ before }) =>
        before === null
          ? withEvents([comment("2", "Newer")], "Y3Vy")
          : withEvents([comment("1", "Older")], null),
    });

    const button = await slot.findByRole("button", { name: "Load older events" });
    await act(async () => fireEvent.click(button));

    expect(events(slot).map((item) => item.textContent)).toEqual([
      expect.stringContaining("Older"),
      expect.stringContaining("Newer"),
    ]);
    expect(timelineCalls(slot).at(-1)).toEqual({ threadId: "thr_1", before: "Y3Vy" });
    expect(slot.queryByRole("button", { name: "Load older events" })).toBeNull();
  });

  it("shows the new comment as the last event after a post", async () => {
    let result = withEvents([comment("1", "First")]);
    const slot = renderTimeline({
      getTimeline: () => result,
      addPrComment: () => {
        result = withEvents([comment("1", "First"), comment("2", "Thanks, fixed")]);
        return { kind: "ok" };
      },
    });
    fireEvent.change(await slot.findByRole("textbox", { name: "Comment" }), {
      target: { value: "Thanks, fixed" },
    });

    await act(async () => fireEvent.click(slot.getByRole("button", { name: "Comment" })));

    expect(events(slot).at(-1)?.textContent).toContain("Thanks, fixed");
  });

  it("shows a locked note instead of the comment box when the viewer cannot comment", async () => {
    const slot = renderTimeline({ ...withEvents([]), locked: true, viewerCanUpdate: false });

    expect(await slot.findByText("This conversation is locked")).toBeTruthy();
    expect(slot.queryByRole("textbox", { name: "Comment" })).toBeNull();
  });

  it("keeps the comment box on a locked PR for a viewer with write access", async () => {
    const slot = renderTimeline({ ...withEvents([]), locked: true, viewerCanUpdate: true });

    expect(await slot.findByRole("textbox", { name: "Comment" })).toBeTruthy();
  });

  it("keeps the events and the typed comment when a later read fails", async () => {
    let result: TimelineResult = withEvents([comment("1", "First")]);
    const slot = renderTimeline({ getTimeline: () => result });
    const box = (await slot.findByRole("textbox", { name: "Comment" })) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "Half written" } });

    result = { kind: "error", message: "rate limited" };
    slot.lifecycle.rerender(<TimelineSections threadId="thr_1" refreshedAt={2} />);

    expect((await slot.findByRole("alert")).textContent).toContain("rate limited");
    expect(slot.getByText("First")).toBeTruthy();
    expect((slot.getByRole("textbox", { name: "Comment" }) as HTMLTextAreaElement).value).toBe(
      "Half written",
    );
  });

  it("keeps the older events when the newest page reads again", async () => {
    let newest = withEvents([comment("2", "Newer")], "Y3Vy");
    const slot = renderTimeline({
      getTimeline: ({ before }) =>
        before === null ? newest : withEvents([comment("1", "Older")], null),
    });
    const loadOlder = await slot.findByRole("button", { name: "Load older events" });
    await act(async () => fireEvent.click(loadOlder));

    newest = withEvents([comment("3", "Newest")], "Y3Vz");
    slot.lifecycle.rerender(<TimelineSections threadId="thr_1" refreshedAt={2} />);

    await slot.findByText("Newest");
    expect(events(slot).map((item) => item.textContent)).toEqual([
      expect.stringContaining("Older"),
      expect.stringContaining("Newer"),
      expect.stringContaining("Newest"),
    ]);
    expect(slot.queryByRole("button", { name: "Load older events" })).toBeNull();
  });

  it("shows the PR description in its own section, outside the conversation", async () => {
    const slot = renderTimeline({
      ...withEvents([comment("1", "First comment")]),
      description: { body: "Fixes the total.", author: "koenvg", at },
    });
    await loaded(slot);

    const description = slot.getByRole("region", { name: "Description" });
    expect(description.textContent).toMatch(/koenvg\s*opened this/);
    expect(within(description).getByTestId("bb-markdown").textContent).toBe("Fixes the total.");
    const conversation = slot.getByRole("region", { name: "Conversation" });
    expect(conversation.textContent).not.toContain("Fixes the total.");
    expect(events(slot)[0]?.textContent).toContain("First comment");
  });

  it("says when the PR has no description", async () => {
    const slot = renderTimeline({
      ...withEvents([]),
      description: { body: "  ", author: "koenvg", at },
    });

    expect(await slot.findByText("No description provided.")).toBeTruthy();
    expect(slot.getByText("No conversation yet")).toBeTruthy();
  });

  it("folds a long description until the user shows all of it", async () => {
    const height = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(900);
    try {
      const slot = renderTimeline({
        ...withEvents([]),
        description: { body: "A long description", author: "koenvg", at },
      });

      const toggle = await slot.findByRole("button", { name: /Show full description/ });
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      fireEvent.click(toggle);
      expect(slot.getByRole("button", { name: /Show less/ }).getAttribute("aria-expanded")).toBe(
        "true",
      );
    } finally {
      height.mockRestore();
    }
  });
});
