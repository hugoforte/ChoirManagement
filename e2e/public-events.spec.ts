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

// Regression coverage for the exact class of bug MemberPage's split into a
// gate + ResolvedMemberPage exists to prevent (see #27): a Member-only route
// must redirect a signed-out visitor before any requireMember-backed query
// (like choirSettings.get) ever subscribes, not throw and blank the page.
//
// waitForURL, not expect(page).toHaveURL()'s default 5s timeout — an
// anonymous visit to a cold, ephemeral preview URL can take longer than that
// just for useAuth()'s isLoaded to resolve, before MemberPage ever decides
// to redirect. Same historical Clerk-latency shape this file's other
// comment already describes, just on a gated route instead of /public/events.
test("a signed-out visitor hitting a Member-only route is redirected to the public Events page", async ({
  page,
}) => {
  await page.goto("/events");
  await page.waitForURL(/\/public\/events$/, { timeout: 15000 });
  await expect(page.getByRole("heading", { name: "Upcoming Events" })).toBeVisible();
});

test("guest can open a public Event and see its Setlist", async ({ page }) => {
  await page.goto("/public/events");
  await page.getByRole("link", { name: "Spring Concert" }).click();

  await expect(page).toHaveURL(/\/public\/events\/.+/);
  await expect(page.getByRole("heading", { name: "Spring Concert" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Setlist" })).toBeVisible();
  await expect(page.getByRole("list")).toContainText("Sicut Cervus");
  await expect(page.getByRole("list")).toContainText("The Blue Bird");
  await expect(page.getByRole("list")).toContainText("Bogoroditse Devo");
});

test("guest can change and persist the color theme", async ({ page }) => {
  await page.goto("/public/events");
  await page.getByRole("radio", { name: "Dark" }).click();

  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");

  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
});
