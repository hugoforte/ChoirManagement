// A Bulletin's body is authored and stored as Markdown and rendered here —
// client-side for the reading view (#49) and server-side for the email a
// publish sends (#52). Raw HTML must never be injectable, which is the whole
// reason this file configures a renderer rather than calling one inline, and
// the reason both callers read this one config instead of each building
// their own. src/lib/markdown.ts re-exports it, the same way src/lib/roles.ts
// re-reads lib/capabilities.ts.
//
// Dependency rationale, per AGENTS.md's dependency guidelines: markdown-it
// is the reference CommonMark implementation, actively maintained, ships
// its own types, and has `html: false` as its default — raw HTML in the
// source is *escaped*, not stripped by a filter that could be bypassed. It
// does pull its own runtime dependencies (argparse, linkify-it, mdurl,
// punycode.js, uc.micro). `marked` was the alternative, but it passes raw HTML
// through and would have required a second dependency (DOMPurify) plus a
// sanitiser config kept correct forever; one direct dependency with the
// unsafe path off beats two with a filter in front of it. markdown-it also
// validates link targets, so `javascript:` and `vbscript:` URLs never reach
// an href.
import MarkdownIt from "markdown-it";

// html: false is markdown-it's default and is restated here on purpose —
// this single option is the security property, and it should be impossible
// to flip it without reading why not to.
const md = new MarkdownIt({
  html: false,
  // Bare URLs pasted into rehearsal notes become links.
  linkify: true,
  // A Bulletin is written like an email, where a single newline means a
  // line break rather than a continued paragraph.
  breaks: true,
});

export function renderMarkdown(source: string): string {
  return md.render(source);
}
