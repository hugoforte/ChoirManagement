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
