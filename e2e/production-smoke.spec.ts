import { test, expect } from "@playwright/test";

// Production smoke tests must remain read-only and make no assumptions about
// preview seed data. They run against the stable public URL after main deploys
// and on a daily schedule, covering the alias, SPA rewrite, frontend bundle,
// Convex public query, and browser-persisted theme preference together.
test("public Events page is reachable through the stable production URL", async ({ page }) => {
  const response = await page.goto("/public/events");

  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { name: "Upcoming Events" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
});

test("color theme can be changed and persists across a production reload", async ({ page }) => {
  await page.goto("/public/events");
  await page.getByRole("radio", { name: "Dark" }).click();

  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
});

test("configured public Event detail is reachable", async ({ page }) => {
  const eventId = process.env.PRODUCTION_PUBLIC_EVENT_ID;
  test.skip(!eventId, "Set PRODUCTION_PUBLIC_EVENT_ID to enable the production Event detail canary.");

  const response = await page.goto(`/public/events/${eventId}`);

  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("link", { name: /All events/ })).toBeVisible();
  await expect(page.getByText("This Event is private.")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
