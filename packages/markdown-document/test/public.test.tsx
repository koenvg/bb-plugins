// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MarkdownDocument, denyDestinations } from "@bb-plugins/markdown-document";
import { readFileSync } from "node:fs";

afterEach(cleanup);
const fixture = readFileSync(`${process.cwd()}/test/fixtures/report.md`, "utf8");

describe("compiled public document interface", () => {
  it("renders semantic GFM and plain code with inert destinations including footnotes", () => {
    const { container } = render(
      <MarkdownDocument
        text={fixture}
        view="preview"
        namespace="task-one"
        destinations={denyDestinations}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Report");
    expect(screen.getByRole("table").textContent).toBe("KeyValuefulfilledinconclusive");
    expect(screen.getByRole("checkbox").hasAttribute("disabled")).toBe(true);
    expect(container.querySelector("del")?.textContent).toBe("old");
    expect(container.querySelector("pre")?.textContent).toBe(
      '  const x = "fulfilled";\n\tline  \n',
    );
    expect(screen.getByRole("img", { name: "chart" }).textContent).toBe("chart");
    expect(container.querySelectorAll("a,img,script,iframe,button").length).toBe(0);
    expect(container.textContent).toContain("footnote text");
    expect(container.textContent).toContain("external");
    expect(container.textContent).toContain("relative");
  });
  it("preserves the exact source string through view changes, including BOM and CRLF", () => {
    const text = readFileSync(`${process.cwd()}/test/fixtures/exact-source.txt`, "utf8");
    expect(text).toBe("\uFEFF---\r\ntitle: report\r\n---\r\n\r\n```unknown\r\n\t x  \r\n```\r\n");
    const { rerender } = render(<MarkdownDocument text={text} view="raw" namespace="raw" />);
    expect(screen.getByLabelText("Raw source").textContent).toBe(text);
    rerender(<MarkdownDocument text={text} view="preview" namespace="raw" />);
    expect(screen.getByText("title: report").textContent).toBe("title: report");
    rerender(<MarkdownDocument text={text} view="raw" namespace="raw" />);
    expect(screen.getByLabelText("Raw source").textContent).toBe(text);
  });
  it("never mounts HTML or MDX and default-denies every destination", () => {
    const text =
      '<script>window.bad = true</script>\n\n<iframe src="https://example.org"></iframe>\n\n<Component onClick={run()} />\n\n[unsafe](javascript:alert%281%29) ![local](./secret.png) [fragment](#x) [malformed](%ZZ)';
    const { container } = render(<MarkdownDocument text={text} view="preview" namespace="deny" />);
    expect(container.querySelectorAll("a,img,script,iframe,component").length).toBe(0);
    expect(container.textContent).toBe("\n\n\nunsafe local fragment malformed");
  });
  it("keeps unknown and large fences plain without inferred badges", () => {
    const body = '  x = "fulfilled";  \n'.repeat(1300);
    const { container } = render(
      <MarkdownDocument text={"```unknown\n" + body + "```"} view="preview" namespace="code" />,
    );
    expect(container.querySelector("code")?.textContent).toBe(body);
    expect(container.querySelectorAll("code span").length).toBe(0);
  });
});
