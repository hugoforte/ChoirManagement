import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect } from "@playwright/test";

// Uses the storageState saved by e2e/auth.setup.ts (chromium-admin
// project) — signed in as a Member with the "admin" role. See
// docs/architecture/ci-cd-and-testing.md.
test("admin can update the choir name and see it reflected on the home page", async ({ page, context }) => {
  await setupClerkTestingToken({ context });

  const name = `E2E Test Choir ${Date.now()}`;

  await page.goto("/settings");
  await page.getByLabel("Choir name").fill(name);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();

  // The choir name renders in the sidebar brand label, not as a page
  // heading — Dashboard's <h1> is the static "Dashboard" title.
  await page.goto("/");
  await expect(page.getByText(name)).toBeVisible();
});
