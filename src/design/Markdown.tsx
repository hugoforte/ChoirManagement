// The only place in the app that hands raw HTML to React. It is safe
// precisely because renderMarkdown escapes raw HTML rather than passing it
// through — keeping the one dangerouslySetInnerHTML in a single named
// component means the guarantee has one place to be checked, and a Bulletin
// body can't be rendered some other, unreviewed way.
//
// See src/lib/markdown.ts for why the renderer is configured with
// `html: false` and what was rejected in its place.
import { renderMarkdown } from "../lib/markdown";

export function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <div
      className={`markdown ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }}
    />
  );
}
