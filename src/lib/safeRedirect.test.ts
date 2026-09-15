// safeRedirect guards /sign-in against becoming an open redirect (#83). The
// hostile cases below are the point of the module — the backslash variants
// in particular defeat the obvious "starts with / but not //" check, because
// the URL parser treats a backslash as a slash in an http(s) URL.
import { describe, expect, test } from "vitest";

import { safeRedirect } from "./safeRedirect";

// Written via charCode so the escaping survives being read at a glance:
// these are single-backslash strings, not escaped ones.
const BACKSLASH = String.fromCharCode(92);

describe("safeRedirect", () => {
  test("keeps a same-site path", () => {
    expect(safeRedirect("/s/tok_abc")).toBe("/s/tok_abc");
  });

  test("keeps a path's query and hash", () => {
    expect(safeRedirect("/bulletins?page=2#latest")).toBe("/bulletins?page=2#latest");
  });

  test("refuses an absolute URL on another origin", () => {
    expect(safeRedirect("https://evil.com/phish")).toBe("/");
  });

  test("refuses a protocol-relative URL", () => {
    expect(safeRedirect("//evil.com")).toBe("/");
  });

  test("refuses a backslash disguised as a path", () => {
    expect(safeRedirect(`/${BACKSLASH}evil.com`)).toBe("/");
  });

  test("refuses a backslash-slash disguised as a path", () => {
    expect(safeRedirect(`/${BACKSLASH}/evil.com`)).toBe("/");
  });

  test("refuses a javascript: scheme", () => {
    expect(safeRedirect("javascript:alert(1)")).toBe("/");
  });

  test("falls back home for an empty target", () => {
    expect(safeRedirect("")).toBe("/");
  });

  test("falls back home when no target was given", () => {
    expect(safeRedirect(null)).toBe("/");
    expect(safeRedirect(undefined)).toBe("/");
  });

  test("refuses a path that normalises back to protocol-relative", () => {
    expect(safeRedirect("/..//evil.com")).toBe("/");
  });
});
