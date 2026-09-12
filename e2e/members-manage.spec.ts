import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect } from "@playwright/test";

// Uses the storageState saved by e2e/auth-admin.setup.ts (chromium-admin
// project) — signed in as a Member with the "admin" role. See
// docs/architecture/ci-cd-and-testing.md.
//
// Round-trips the Role change (back to whatever it started as) rather than
// asserting a fixed end state, since this runs against the same seeded
// preview backend on every CI run for a PR — leaving "Test Chorister"
// permanently promoted would make the second run start from a different
// place than the first.
test("admin can change a Member's Role and see it reflected on the roster", async ({ page, context }) => {
  await setupClerkTestingToken({ context });

  await page.goto("/members/manage");
  const row = page.getByRole("listitem").filter({ hasText: "Test Chorister" });
  const select = row.getByRole("combobox");
  const originalRole = await select.inputValue();

  await select.selectOption("director");
  await expect(select).toHaveValue("director");

  await page.goto("/members");
  await expect(page.getByRole("listitem").filter({ hasText: "Test Chorister" })).toContainText("director");

  await page.goto("/members/manage");
  await page.getByRole("listitem").filter({ hasText: "Test Chorister" }).getByRole("combobox").selectOption(originalRole);
});
