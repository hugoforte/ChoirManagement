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

  // Preview deployments carry no RESEND_API_KEY (#52), so the Director is
  // told email is off rather than offered a checkbox that does nothing.
  // This assertion is the degraded path, and it is the only email behaviour
  // E2E can prove — verifying a real send needs a verified sender domain,
  // which is the human step this slice stops at.
  await expect(page.getByText(/Email is not configured for this deployment/)).toBeVisible();
  await expect(page.getByLabel("Email this Bulletin to the roster")).toHaveCount(0);

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/^Published /)).toBeVisible();
  // There is no un-publish (#49), so the action is gone for good.
  await expect(page.getByRole("button", { name: "Publish" })).toHaveCount(0);

  // Nothing was queued, and the delivery panel says so rather than sitting
  // empty.
  await expect(page.getByText(/This Bulletin wasn.t emailed\./)).toBeVisible();

  // A published Bulletin stays editable and gains an "edited" timestamp
  // beside its published date; publishing never happens twice.
  await page.getByLabel("Title").fill(`${title} (updated)`);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Edited /)).toBeVisible();

  await page.goto("/bulletins/manage");
  await expect(page.getByRole("link", { name: `${title} (updated)` })).toBeVisible();
});

// The Piece reverse lookup (#81) end to end: a Remark left while composing
// a Bulletin has to come back out on the Piece it names, which is the whole
// reason a Remark references a Piece structurally.
test("a Remark on a published Bulletin shows up on its Piece", async ({ page, context }) => {
  await setupClerkTestingToken({ context });

  const title = `E2E Remark Bulletin ${Date.now()}`;
  const remark = `Watch the cutoff at bar 48 (${Date.now()}).`;

  // Take whichever Piece the preview seed created rather than naming one —
  // the spec needs a real Piece id to navigate back to, and the picker
  // lists the Library by title.
  await page.goto("/library");
  const pieceLink = page.locator('a[href^="/library/"]:not([href="/library/manage"])').first();
  await expect(pieceLink).toBeVisible();
  const pieceTitle = (await pieceLink.innerText()).trim();
  await pieceLink.click();
  await page.waitForURL(/\/library\/.+/);
  const pieceUrl = page.url();

  await page.goto("/bulletins/manage");
  await page.getByPlaceholder("New Bulletin title").fill(title);
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("link", { name: title }).click();
  await page.waitForURL(/\/bulletins\/manage\/.+/);

  await page.getByLabel("Piece").selectOption({ label: pieceTitle });
  await page.getByLabel("Remark", { exact: true }).fill(remark);
  await page.getByRole("button", { name: "Add Remark" }).click();
  await expect(page.getByLabel(`Remark about ${pieceTitle}`)).toHaveValue(remark);

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/^Published /)).toBeVisible();

  await page.goto(pieceUrl);
  await expect(page.getByRole("heading", { name: "Remarks from Bulletins" })).toBeVisible();
  await expect(page.getByText(remark)).toBeVisible();
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});
