// @vitest-environment jsdom
import { fail as missingValue } from "node:assert/strict";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { parsePatchFiles, type DiffLineAnnotation, type SelectedLineRange } from "@pierre/diffs";
import { ReviewFileDiff, type ReviewFileDiffProps } from "./review-file-diff";

const receivedOptions: unknown[] = [];

vi.mock("@pierre/diffs/react", () => ({
  FileDiff: ({
    options,
    lineAnnotations,
    renderAnnotation,
    renderHeaderPrefix,
    renderHeaderMetadata,
  }: {
    options: {
      diffStyle: string;
      collapsed?: boolean;
      enableGutterUtility?: boolean;
      onGutterUtilityClick?: (range: SelectedLineRange) => void;
    };
    lineAnnotations: DiffLineAnnotation<string>[];
    renderAnnotation: (annotation: DiffLineAnnotation<string>) => ReactNode;
    renderHeaderPrefix?: () => ReactNode;
    renderHeaderMetadata?: () => ReactNode;
  }) => (
    <div
      ref={() => {
        receivedOptions.push(options);
      }}
      data-testid="diff"
      data-style={options.diffStyle}
      data-collapsed={String(options.collapsed ?? false)}
      data-gutter-utility={String(options.enableGutterUtility ?? false)}
      data-has-gutter-click={String(options.onGutterUtilityClick !== undefined)}
    >
      {renderHeaderPrefix?.()}
      {renderHeaderMetadata?.()}
      {lineAnnotations.map((annotation) => (
        <div key={annotation.lineNumber}>{renderAnnotation(annotation)}</div>
      ))}
      <button
        type="button"
        onClick={() => options.onGutterUtilityClick?.({ start: 4, end: 4, side: "deletions" })}
      >
        old
      </button>
      <button type="button" onClick={() => options.onGutterUtilityClick?.({ start: 7, end: 7 })}>
        sideless
      </button>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  receivedOptions.length = 0;
});

const fileDiff =
  (
    parsePatchFiles("diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-a\n+b\n")[0] ??
    missingValue("Expected a non-null value")
  ).files[0] ?? missingValue("Expected a non-null value");

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

it("wraps each annotation in an element with inline-size containment", () => {
  const view = render(
    <ReviewFileDiff
      fileDiff={fileDiff}
      annotations={[{ side: "additions", lineNumber: 1, metadata: "card" }]}
      renderAnnotation={(annotation) => <span>{annotation.metadata}</span>}
      onAddComment={() => {}}
      view="split"
      theme={{ name: "github", mode: "light" }}
    />,
  );

  const wrapper = view.getByText("card").parentElement ?? missingValue("Expected a non-null value");
  expect(wrapper.style.contain).toBe("inline-size");
});

it("turns on the gutter utility when there is an add-comment handler", () => {
  const view = render(
    <ReviewFileDiff
      fileDiff={fileDiff}
      annotations={[]}
      renderAnnotation={() => null}
      onAddComment={() => {}}
      view="split"
      theme={{ name: "github", mode: "light" }}
    />,
  );

  expect(view.getByTestId("diff").dataset.gutterUtility).toBe("true");
  expect(view.getByTestId("diff").dataset.hasGutterClick).toBe("true");
});

it("turns off the gutter utility when there is no add-comment handler", () => {
  const view = render(
    <ReviewFileDiff
      fileDiff={fileDiff}
      annotations={[]}
      renderAnnotation={() => null}
      view="split"
      theme={{ name: "github", mode: "light" }}
    />,
  );

  expect(view.getByTestId("diff").dataset.gutterUtility).toBe("false");
  expect(view.getByTestId("diff").dataset.hasGutterClick).toBe("false");
});

it("keeps the diff options when a re-render passes new callbacks, and calls the latest one", () => {
  const first = vi.fn();
  const latest = vi.fn();
  const props = {
    fileDiff,
    annotations: [],
    view: "split",
    theme: { name: "github", mode: "light" },
  } satisfies Partial<ReviewFileDiffProps<string>>;
  const view = render(
    <ReviewFileDiff
      {...props}
      renderAnnotation={() => null}
      onAddComment={first}
      onToggleCollapsed={() => {}}
      onPostRender={() => {}}
    />,
  );
  view.rerender(
    <ReviewFileDiff
      {...props}
      renderAnnotation={() => null}
      onAddComment={latest}
      onToggleCollapsed={() => {}}
      onPostRender={() => {}}
    />,
  );

  fireEvent.click(view.getByRole("button", { name: "old" }));

  expect(new Set(receivedOptions).size).toBe(1);
  expect(first).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledWith("deletions", 4);
});
