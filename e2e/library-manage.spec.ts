import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect } from "@playwright/test";

// Uses the storageState saved by e2e/auth.setup.ts (chromium-director
// project) — signed in as a Member with the "director" role. See
// docs/architecture/ci-cd-and-testing.md.
test("director can add a Piece to the Music Library and see it in the list", async ({ page, context }) => {
  await setupClerkTestingToken({ context });

  const title = `E2E Test Piece ${Date.now()}`;

  await page.goto("/library/manage");
  await page.getByPlaceholder("New Piece title").fill(title);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("button", { name: title })).toBeVisible();

  await page.goto("/library");
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});
