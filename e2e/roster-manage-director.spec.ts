import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect } from "@playwright/test";

// Uses the storageState saved by e2e/auth.setup.ts (chromium-director
// project) — signed in as a Member with the "director" role. See
// docs/architecture/ci-cd-and-testing.md.
//
// Named roster-manage-*, not members-manage-*, deliberately: chromium-admin's
// testMatch is a substring regex on "members-manage" and would otherwise
// pick this file up too, running a Director-only assertion under an Admin
// session.
//
// Coverage for #28's resolved open question: a Director reaches
// /members/manage (manageRoster) but the Role control stays Admin-only
// (assignRoles) — see docs/architecture/frontend-routes.md and
// CONTEXT.md's Capability entry. Before #28, the whole route was
// isAdmin-gated and a Director got the denial screen here instead.
test("director can view /members/manage but the Role control is read-only", async ({ page, context }) => {
  await setupClerkTestingToken({ context });

  await page.goto("/members/manage");

  await expect(page.getByRole("heading", { name: "Manage Roles" })).toBeVisible();
  await expect(page.getByText("You don't have access to this page.")).toHaveCount(0);

  const row = page.getByRole("listitem").filter({ hasText: "Test Admin" });
  await expect(row).toBeVisible();
  await expect(row.getByRole("combobox")).toHaveCount(0);
  await expect(row).toContainText("admin");
});
