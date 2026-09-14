import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect } from "@playwright/test";

// Uses the storageState saved by e2e/auth.setup.ts (chromium-director
// project) — signed in as a Member with the "director" role. See
// docs/architecture/ci-cd-and-testing.md.
test("director can create a Poll with several Candidate Dates", async ({ page, context }) => {
  await setupClerkTestingToken({ context });

  const title = `E2E Test Poll ${Date.now()}`;

  await page.goto("/polls/manage");
  await page.getByLabel("Title").fill(title);

  // exact, because "Candidate Date 1" is also a prefix of that row's start
  // and end time inputs.
  await page.getByLabel("Candidate Date 1", { exact: true }).fill("2026-03-07");
  await page.getByRole("button", { name: "Add another date" }).click();
  await page.getByLabel("Candidate Date 2", { exact: true }).fill("2026-03-14");
  await page.getByLabel("Candidate Date 2 start time").fill("19:30");
  await page.getByLabel("Candidate Date 2 end time").fill("21:00");
  await page.getByRole("button", { name: "Create Poll" }).click();

  const pollLink = page.getByRole("link", { name: title });
  await expect(pollLink).toBeVisible();

  await pollLink.click();
  await page.waitForURL(/\/polls\/manage\/.+/);
  await expect(page.getByLabel("Title")).toHaveValue(title);

  // Both dates survive, in the order they were entered, and only the one
  // given times reads as a window — a date-only Candidate Date is stored as
  // local midnight and shown as a bare date.
  const candidateDates = page.getByRole("listitem").filter({ hasText: "2026-03-" });
  await expect(candidateDates).toHaveCount(2);
  await expect(candidateDates.first()).toContainText("2026-03-07");
  await expect(candidateDates.last()).toContainText("2026-03-14 19:30–21:00");
});
