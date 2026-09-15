import { describe, expect, it } from "vitest";

import { bulletinEmailUrl, readEmailConfig, renderBulletinEmail } from "./bulletinEmail";

const COMPLETE = {
  RESEND_API_KEY: "re_key",
  BULLETINS_FROM_EMAIL: "Choir <bulletins@example.org>",
  APP_BASE_URL: "https://choir.example.org",
};

describe("readEmailConfig", () => {
  it("reads a complete environment", () => {
    expect(readEmailConfig(COMPLETE)).toEqual({
      apiKey: "re_key",
      from: "Choir <bulletins@example.org>",
      appBaseUrl: "https://choir.example.org",
    });
  });

  // Half-configured is the same as unconfigured: a key with no sender can't
  // send, and a sender with no app URL would mail a link to nowhere.
  it.each(Object.keys(COMPLETE))("returns null when %s is missing", (missing) => {
    expect(readEmailConfig({ ...COMPLETE, [missing]: undefined })).toBeNull();
  });

  it("treats a blank value as unset", () => {
    expect(readEmailConfig({ ...COMPLETE, RESEND_API_KEY: "   " })).toBeNull();
  });

  // A trailing slash pasted out of a browser address bar would otherwise
  // produce `https://choir.example.org//bulletins/…`.
  it("strips a trailing slash from the app URL", () => {
    expect(readEmailConfig({ ...COMPLETE, APP_BASE_URL: "https://choir.example.org/" })?.appBaseUrl).toBe(
      "https://choir.example.org",
    );
  });
});

describe("bulletinEmailUrl", () => {
  it("prefers the Share Link, which also opens without an account", () => {
    expect(bulletinEmailUrl("https://x.test", { bulletinId: "b1", shareToken: "tok" })).toBe(
      "https://x.test/s/tok",
    );
  });

  it("falls back to the in-app Bulletin when no Share Link was issued", () => {
    expect(bulletinEmailUrl("https://x.test", { bulletinId: "b1" })).toBe(
      "https://x.test/bulletins/b1",
    );
  });
});

describe("renderBulletinEmail", () => {
  it("escapes a title that contains markup", () => {
    const email = renderBulletinEmail({
      title: "Rehearsal <b>moved</b>",
      body: "",
      url: "https://x.test/b",
    });
    expect(email.html).toContain("Rehearsal &lt;b&gt;moved&lt;/b&gt;");
    // The subject is a header value, not markup — it stays as typed.
    expect(email.subject).toBe("Rehearsal <b>moved</b>");
  });

  it("escapes raw HTML in the body rather than passing it through", () => {
    const email = renderBulletinEmail({
      title: "T",
      body: "<script>alert(1)</script>",
      url: "https://x.test/b",
    });
    expect(email.html).not.toContain("<script>");
  });

  it("carries the link in both the HTML and the plain-text alternative", () => {
    const email = renderBulletinEmail({ title: "T", body: "Hi", url: "https://x.test/b" });
    expect(email.html).toContain('href="https://x.test/b"');
    expect(email.text).toContain("https://x.test/b");
  });
});
