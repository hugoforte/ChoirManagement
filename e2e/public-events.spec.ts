import { test, expect } from "@playwright/test";

// Guest-only and Clerk-free: it asserts the public Events page works with no
// auth involved at all, which is exactly what an unauthenticated visitor gets.
//
// Historical note: this was originally scoped this way because "/" hung
// waiting on Clerk to resolve isSignedIn against a preview URL, which was
// recorded as "Clerk doesn't support ephemeral vercel.app URLs". That was a
// misdiagnosis — preview builds had no Clerk publishable key at all and were
// failing outright. Clerk dev keys are now verified working on previews, so
// staying Clerk-free here is a choice, not a constraint.
test("public Events page loads for a guest visitor", async ({ page }) => {
  await page.goto("/public/events");
  await expect(page.getByRole("heading", { name: "Upcoming Events" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});
