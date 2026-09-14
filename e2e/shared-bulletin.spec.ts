import { test, expect } from "@playwright/test";

// Guest-only and Clerk-free, like public-events.spec.ts: /s/:token is the
// app's only unauthenticated read of Member-only content (#83, ADR-0004), so
// it has to work with no session at all.
//
// This asserts the dead-link case rather than a real shared Bulletin. A
// seeded Bulletin with a token Share Link would need convex/seed.ts, which
// belongs to a sibling slice (#82); the invalid-token page proves the two
// things this slice owns end to end anyway — that the route is registered,
// and that vercel.json's SPA rewrite serves it on a hard navigation. A token
// carries no dot, so it must fall through the rewrite's `(?!.*\.)` guard to
// index.html rather than 404 as a missing asset.
test("a guest hitting an invalid Share Link gets the dead-link page, not a 404", async ({ page }) => {
  const response = await page.goto("/s/not-a-real-token");

  // The SPA rewrite, not a 404 from the static host.
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "This link is no longer valid" })).toBeVisible();
});

test("the dead-link page offers a way in and reveals nothing about the Bulletin", async ({ page }) => {
  await page.goto("/s/not-a-real-token");

  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  // It must not leak whether a Bulletin behind that token exists.
  await expect(page.getByText(/no longer valid/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Not found" })).toHaveCount(0);
});
