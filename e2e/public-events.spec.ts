import { test, expect } from "@playwright/test";

test("public Events page loads for a guest visitor", async ({ page }) => {
  await page.goto("/public/events");
  await expect(page.getByRole("heading", { name: "Upcoming Events" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("root redirects a signed-out visitor to the public Events page", async ({ page }) => {
  await page.goto("/");
  // Clerk's client SDK has to load and resolve isSignedIn before Home.tsx
  // renders the redirect; on a cold deployment that can take a bit, so this
  // needs a longer timeout than the default 5s.
  await expect(page).toHaveURL(/\/public\/events$/, { timeout: 15000 });
});
