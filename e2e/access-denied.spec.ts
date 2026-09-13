import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect } from "@playwright/test";

// Uses the storageState saved by e2e/auth.setup.ts (chromium-director
// project) — signed in as a Member with the "director" role, which is
// enough to reach /settings but not enough to use it: Settings is
// Admin-only. Exercises MemberPage's denial screen (see #27), the one path
// every manage/admin route now shares instead of five hand-written copies.
test("a director hitting an Admin-only route sees the denial screen, not the page", async ({ page, context }) => {
  await setupClerkTestingToken({ context });

  await page.goto("/settings");

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("You don't have access to this page.")).toBeVisible();
  // The Settings nav item itself isn't offered to a non-Admin — same
  // isAdmin check MemberPage uses to decide showSettings.
  await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);

  await page.getByRole("link", { name: "Back home" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
