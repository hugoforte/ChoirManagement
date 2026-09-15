import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect } from "@playwright/test";

// Regression coverage for the exact class of bug MemberPage's split into a
// gate + ResolvedMemberPage exists to prevent (see #27): a Member-only route
// must redirect a signed-out visitor before any requireMember-backed query
// (like choirSettings.get) ever subscribes, not throw and blank the page.
//
// Deliberately NOT in public-events.spec.ts / chromium-guest, even though
// there's no session here either: unlike every other test in that file,
// this one hits a *gated* route, so MemberPage's useAuth() must actually
// bootstrap Clerk's client SDK to learn isLoaded/isSignedIn — chromium-guest
// carries no CLERK_SECRET_KEY in CI (by design, see playwright.config.ts),
// so there's no way to call setupClerkTestingToken there. Without it, an
// anonymous Clerk SDK boot inside a CI runner's automated-browser fingerprint
// hit Clerk's bot detection and never resolved — reproduced locally against
// the real preview deployment only under CI-matching concurrency, not in
// isolation. This project rides along in the e2e-authenticated job instead,
// which already has CLERK_SECRET_KEY wired for chromium-director/-admin, but
// uses no storageState — a genuinely anonymous browser context.
test("a signed-out visitor hitting a Member-only route is redirected to the public Events page", async ({
  page,
  context,
}) => {
  await setupClerkTestingToken({ context });

  await page.goto("/events");
  await page.waitForURL(/\/public\/events$/);
  await expect(page.getByRole("heading", { name: "Upcoming Events" })).toBeVisible();
});

// No Poll route may be public (#9): a Poll's grid is named personal data
// about identifiable Members, and there is deliberately no /public twin and
// no token-shared link to fall back on. A signed-out visitor is redirected
// off both the list and a Poll detail URL before either subscribes to
// anything, so neither leaks a Poll title, let alone a Member's name.
//
// Here rather than in public-events.spec.ts / chromium-guest for the same
// reason as the test above: these are gated routes, so MemberPage's
// useAuth() has to boot Clerk's client SDK, and chromium-guest carries no
// CLERK_SECRET_KEY to call setupClerkTestingToken with.
test("a signed-out visitor gets no Poll data from either Poll route", async ({ page, context }) => {
  await setupClerkTestingToken({ context });

  for (const path of ["/polls", "/polls/some-id"]) {
    await page.goto(path);
    await page.waitForURL(/\/public\/events$/);
    await expect(page.getByRole("heading", { name: "Polls" })).toHaveCount(0);
  }

  await expect(page.getByRole("heading", { name: "Upcoming Events" })).toBeVisible();
});
