// Re-exported from the Convex side, which is where the renderer now lives:
// the Bulletin email (#52) renders the same Markdown server-side, and the
// `html: false` option below is a security property that must not be able
// to differ between the two. Same seam as src/lib/roles.ts re-reading
// convex/lib/capabilities.ts rather than restating the Role table.
export { renderMarkdown } from "../../convex/lib/markdown";
