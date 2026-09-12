import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";

// Runs once before chromium-admin. Same ticket-based sign-in strategy as
// e2e/auth.setup.ts (chromium-director) but kept in its own project so a
// broken account for one Role can't block the other's E2E — see that
// file's comment for why they're split.
const adminAuthFile = ".auth/admin.json";

// Not a secret: every preview backend seeds a Member row at this exact
// email/Role via `seed:preview` (scripts/e2e/seed-role-members.mjs), and
// it's the documented account a human uses to manually review a preview
// too (docs/architecture/ci-cd-and-testing.md) — nothing gates on it being
// unguessable.
const ADMIN_EMAIL = "admin+clerk_test@example.com";

setup("authenticate as admin", async ({ page }) => {
  await clerkSetup();

  await page.goto("/");
  await clerk.signIn({ page, emailAddress: ADMIN_EMAIL });

  await page.goto("/");
  await page.getByRole("heading", { name: "Dashboard" }).waitFor();

  await page.context().storageState({ path: adminAuthFile });
});
