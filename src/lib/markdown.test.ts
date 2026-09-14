import { describe, expect, it } from "vitest";

import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders CommonMark", () => {
    expect(renderMarkdown("**Call time** is 6:45.")).toContain("<strong>Call time</strong>");
  });

  it("escapes a <script> tag instead of rendering it as HTML", () => {
    const html = renderMarkdown("Hello <script>alert('xss')</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes an inline event handler on a raw tag", () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  // markdown-it rejects the link rather than emitting it, so the source
  // falls through as escaped literal text — "javascript:" survives as
  // characters on the page, but never as an href.
  it("refuses to build an anchor for a javascript: target", () => {
    const html = renderMarkdown("[click me](javascript:alert(1))");
    expect(html).not.toContain("href");
    expect(html).not.toContain("<a ");
  });

  it("keeps an ordinary link", () => {
    expect(renderMarkdown("[the score](https://example.com/score.pdf)")).toContain(
      'href="https://example.com/score.pdf"',
    );
  });
});
