import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect } from "@playwright/test";

// Uses the storageState saved by e2e/auth.setup.ts (chromium-director
// project) — signed in as a Member with the "director" role, which holds
// manageBulletins but not deletePublishedBulletins. See
// docs/architecture/ci-cd-and-testing.md.
test("director can draft a Bulletin, publish it, and edit it afterwards", async ({ page, context }) => {
  await setupClerkTestingToken({ context });

  const title = `E2E Test Bulletin ${Date.now()}`;
  const body = "**Call time** is 6:45.";

  await page.goto("/bulletins/manage");
  await page.getByPlaceholder("New Bulletin title").fill(title);
  await page.getByRole("button", { name: "Add" }).click();

  const bulletinLink = page.getByRole("link", { name: title });
  await expect(bulletinLink).toBeVisible();

  await bulletinLink.click();
  await page.waitForURL(/\/bulletins\/manage\/.+/);
  await expect(page.getByLabel("Title")).toHaveValue(title);

  await page.getByLabel("Body").fill(body);
  await page.getByRole("button", { name: "Save" }).click();

  // Reload rather than trusting the form's own state — this is what proves
  // the save actually reached the backend.
  await page.reload();
  await expect(page.getByLabel("Body")).toHaveValue(body);

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/^Published /)).toBeVisible();
  // There is no un-publish (#49), so the action is gone for good.
  await expect(page.getByRole("button", { name: "Publish" })).toHaveCount(0);

  // A published Bulletin stays editable and gains an "edited" timestamp
  // beside its published date; publishing never happens twice.
  await page.getByLabel("Title").fill(`${title} (updated)`);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Edited /)).toBeVisible();

  await page.goto("/bulletins/manage");
  await expect(page.getByRole("link", { name: `${title} (updated)` })).toBeVisible();
});
