import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect } from "@playwright/test";

// Uses the storageState saved by e2e/auth.setup.ts (chromium-director
// project) — signed in as a Member with the "director" role. See
// docs/architecture/ci-cd-and-testing.md.
test("director can create an Event, RSVP to it, and see the RSVP reflected on the list", async ({
  page,
  context,
}) => {
  await setupClerkTestingToken({ context });

  const title = `E2E Test Event ${Date.now()}`;

  await page.goto("/events/manage");
  await page.getByPlaceholder("New Event title").fill(title);
  await page.getByRole("button", { name: "Add" }).click();
  const eventLink = page.getByRole("link", { name: title });
  await expect(eventLink).toBeVisible();

  await eventLink.click();
  await page.waitForURL(/\/events\/manage\/.+/);
  await expect(page.getByLabel("Title")).toHaveValue(title);

  await page.goto("/events");
  await page.getByRole("link", { name: title }).click();
  await page.waitForURL(/\/events\/[^/]+$/);
  await page.getByRole("button", { name: "Yes", exact: true }).click();

  await page.goto("/events");
  const row = page.getByRole("listitem").filter({ hasText: title });
  await expect(row).toContainText("yes");
});
