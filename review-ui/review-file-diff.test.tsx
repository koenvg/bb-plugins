// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { parsePatchFiles, type SelectedLineRange } from "@pierre/diffs";
import { ReviewFileDiff } from "./review-file-diff";

vi.mock("@pierre/diffs/react", () => ({
  FileDiff: ({
    options,
    renderHeaderPrefix,
    renderHeaderMetadata,
  }: {
    options: { diffStyle: string; collapsed?: boolean; onGutterUtilityClick: (range: SelectedLineRange) => void };
    renderHeaderPrefix?: () => ReactNode;
    renderHeaderMetadata?: () => ReactNode;
  }) => (
    <div data-testid="diff" data-style={options.diffStyle} data-collapsed={String(options.collapsed ?? false)}>
      {renderHeaderPrefix?.()}
      {renderHeaderMetadata?.()}
      <button type="button" onClick={() => options.onGutterUtilityClick({ start: 4, end: 4, side: "deletions" })}>
        old
      </button>
      <button type="button" onClick={() => options.onGutterUtilityClick({ start: 7, end: 7 })}>
        sideless
      </button>
    </div>
  ),
}));

afterEach(cleanup);

const fileDiff = parsePatchFiles("diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-a\n+b\n")[0]!.files[0]!;

it("passes the view and reports the side and line of a gutter click, new side by default", () => {
  const onAddComment = vi.fn();
  const view = render(
    <ReviewFileDiff
      fileDiff={fileDiff}
      annotations={[]}
      renderAnnotation={() => null}
      onAddComment={onAddComment}
      view="split"
      theme={{ name: "github", mode: "light" }}
    />,
  );

  fireEvent.click(view.getByRole("button", { name: "old" }));
  fireEvent.click(view.getByRole("button", { name: "sideless" }));

  expect(view.getByTestId("diff").dataset.style).toBe("split");
  expect(onAddComment.mock.calls).toEqual([
    ["deletions", 4],
    ["additions", 7],
  ]);
});

it("renders the header prefix and metadata and passes collapsed", () => {
  const view = render(
    <ReviewFileDiff
      fileDiff={fileDiff}
      annotations={[]}
      renderAnnotation={() => null}
      onAddComment={() => {}}
      view="unified"
      theme={{ name: "github", mode: "light" }}
      headerPrefix={<span>prefix</span>}
      headerMetadata={<span>metadata</span>}
      collapsed
    />,
  );

  expect(view.getByText("prefix")).toBeTruthy();
  expect(view.getByText("metadata")).toBeTruthy();
  expect(view.getByTestId("diff").dataset.collapsed).toBe("true");
});
