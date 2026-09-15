// Where to send someone after sign-in, when the destination arrived in a
// query parameter and is therefore attacker-controlled (#83: a Share Link in
// sign-in mode sends its visitor to /sign-in?redirect_url=/s/:token).
//
// An unchecked value here makes /sign-in an open redirect: a phishing link
// that genuinely starts on this app's domain, shows the real Clerk sign-in
// form, and lands the visitor on an attacker's site afterwards.
//
// Prefix checks are not enough, and this is not theoretical — "starts with /
// but not //" accepts `/\evil.com`, which the URL parser normalises to
// `//evil.com` because it treats a backslash as a slash in an http(s) URL.
// So the candidate is resolved the same way the browser would resolve it and
// judged on the result: only a URL that lands back on the placeholder origin
// was ever a same-site path.
const PLACEHOLDER_ORIGIN = "https://placeholder.invalid";

export function safeRedirect(target: string | null | undefined): string {
  if (!target) return "/";

  let resolved: URL;
  try {
    resolved = new URL(target, PLACEHOLDER_ORIGIN);
  } catch {
    return "/";
  }

  // Catches absolute URLs, protocol-relative "//host", the backslash
  // variants above, and non-http schemes like `javascript:` (whose origin
  // parses as "null", never the placeholder).
  if (resolved.origin !== PLACEHOLDER_ORIGIN) return "/";

  const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;
  // Belt and braces: a path that still begins "//" would be read as
  // protocol-relative by whatever consumes it next, origin check or not.
  if (!path.startsWith("/") || path.startsWith("//")) return "/";

  return path;
}
