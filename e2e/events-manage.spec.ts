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
  // "Going", not the raw "yes" status — src/lib/rsvp.ts is the one place
  // naming RSVP labels now (see #31), so both this button and the Events
  // list row below read the same vocabulary instead of two different ones.
  const goingButton = page.getByRole("button", { name: "Going", exact: true });
  await goingButton.click();
  // Wait for the RSVP mutation to actually land before navigating away —
  // otherwise the next page's data can be read before it's written.
  await expect(goingButton).toHaveAttribute("aria-pressed", "true");

  await page.goto("/events");
  // Events.tsx renders this as a <table> row (role="row"), not a <li>.
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row).toContainText("Going");
});
