import { test, expect } from "@playwright/test";

// Guest-only, deliberately never touches "/" or anything that calls Clerk's
// useAuth() — Clerk doesn't reliably support ephemeral vercel.app-style
// preview URLs (confirmed by this test timing out against one: "/" hung
// waiting on Clerk to resolve isSignedIn, while this Clerk-free page loaded
// fine on the exact same deployment). That's the whole reason chromium-guest
// exists as a separate, Clerk-free project — see
// docs/architecture/ci-cd-and-testing.md. The root-redirect behavior itself
// is already confirmed working manually against a real production URL.
test("public Events page loads for a guest visitor", async ({ page }) => {
  await page.goto("/public/events");
  await expect(page.getByRole("heading", { name: "Upcoming Events" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});
