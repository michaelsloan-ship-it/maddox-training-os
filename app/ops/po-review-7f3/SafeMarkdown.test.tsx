import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SafeMarkdown } from "./SafeMarkdown";

describe("safe PO response Markdown", () => {
  it("renders headings, strong text, and plain text readably", () => {
    const html = renderToStaticMarkup(<SafeMarkdown text={"# Recommendation\n\nUse **deterministic evidence**.\n\nPlain text."} />);
    expect(html).toContain("<h2");
    expect(html).toContain("<strong>deterministic evidence</strong>");
    expect(html).toContain("Plain text.");
  });

  it("never executes raw HTML and blocks javascript links", () => {
    const html = renderToStaticMarkup(<SafeMarkdown text={'<img src=x onerror=alert(1)> [bad](javascript:alert(1)) [safe](https://example.com)'} />);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
