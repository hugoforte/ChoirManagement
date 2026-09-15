// Everything about the Bulletin email that doesn't need a Convex context
// (#52): whether this deployment is configured to send at all, which URL the
// email points at, and how a Bulletin's stored Markdown becomes an HTML body
// with a plain-text fallback.
//
// Pure functions over an explicit `env` bag rather than reads of
// `process.env`, so the configured and unconfigured deployments are both
// directly testable — a self-hoster without a mail provider is a first-class
// case here, not an error path.
import { renderMarkdown } from "./markdown";

// Named here rather than inline at each read so the docs, the error messages
// and the code can't drift apart on a variable name.
export const RESEND_API_KEY = "RESEND_API_KEY";
export const BULLETINS_FROM_EMAIL = "BULLETINS_FROM_EMAIL";
export const APP_BASE_URL = "APP_BASE_URL";

export type EmailEnv = Record<string, string | undefined>;

export type BulletinEmailConfig = {
  apiKey: string;
  // A full RFC 5322 from-address, e.g. `Sorrento Choir <bulletins@example.org>`.
  // The domain has to be verified in Resend before anything sends — see
  // docs/guides/self-hosting.md.
  from: string;
  // The app's own origin (Vercel or wherever the frontend is served), with
  // no trailing slash. Convex knows its own site URL but has no way to know
  // the frontend's, and an email whose links go nowhere is worse than no
  // email, so this is required configuration rather than a best guess.
  appBaseUrl: string;
};

function trimmed(env: EmailEnv, name: string): string {
  return (env[name] ?? "").trim();
}

// All three or nothing. A deployment with a key but no sender address can't
// send, and one with no app URL would send a Bulletin nobody can open, so
// there is no useful half-configured state to represent.
export function readEmailConfig(env: EmailEnv): BulletinEmailConfig | null {
  const apiKey = trimmed(env, RESEND_API_KEY);
  const from = trimmed(env, BULLETINS_FROM_EMAIL);
  const appBaseUrl = trimmed(env, APP_BASE_URL).replace(/\/+$/, "");
  if (!apiKey || !from || !appBaseUrl) return null;
  return { apiKey, from, appBaseUrl };
}

// A Share Link is optional and per-Bulletin (ADR-0004), so the email links to
// one only when the Director has issued one. Either URL reaches the same
// Bulletin; the Share Link is the one that also works for a recipient
// without an account, which is exactly why it wins when it exists.
export function bulletinEmailUrl(
  appBaseUrl: string,
  bulletin: { bulletinId: string; shareToken?: string },
): string {
  return bulletin.shareToken
    ? `${appBaseUrl}/s/${bulletin.shareToken}`
    : `${appBaseUrl}/bulletins/${bulletin.bulletinId}`;
}

// The body arrives as rendered HTML from markdown-it (`html: false`, so a
// Bulletin can't inject markup); everything interpolated around it here is
// either a URL this code built or a title a Director typed, so the title
// still needs escaping.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type RenderedBulletinEmail = { subject: string; html: string; text: string };

// Deliberately a plain document with no layout, no images and no tracking:
// the thing this replaces is a Director's own typed email, and every styling
// trick is one more thing to render wrong in somebody's mail client.
//
// The plain-text alternative is the Markdown source itself — Markdown is
// designed to read as prose unrendered, so there is nothing to strip.
export function renderBulletinEmail(bulletin: {
  title: string;
  body: string;
  url: string;
}): RenderedBulletinEmail {
  const { title, body, url } = bulletin;
  const html = [
    `<h1>${escapeHtml(title)}</h1>`,
    renderMarkdown(body),
    `<p><a href="${escapeHtml(url)}">Read this Bulletin in the app</a></p>`,
  ].join("\n");

  const text = [title, "", body.trim(), "", `Read this Bulletin in the app: ${url}`].join("\n");

  return { subject: title, html, text };
}
