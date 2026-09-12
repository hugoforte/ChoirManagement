import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";

// Runs once before chromium-director. Signs in via Clerk's email-based
// ticket strategy (@clerk/testing looks the user up by email and mints a
// sign-in token through the Backend API — no password entry, no OTP, no UI
// form automation) and saves the resulting session so chromium-director can
// reuse it without signing in per-test. See docs/architecture/ci-cd-and-testing.md.
//
// A separate project from e2e/auth-admin.setup.ts on purpose: they used to
// be two tests in one file sharing one "setup" project, which meant a
// broken account for one Role failed the shared project and blocked BOTH
// dependent role projects, not just the broken one.
const directorAuthFile = ".auth/director.json";

setup("authenticate as director", async ({ page }) => {
  await clerkSetup();

  const email = process.env.E2E_DIRECTOR_EMAIL;
  if (!email) {
    throw new Error("E2E_DIRECTOR_EMAIL is not set (check .env.test).");
  }

  await page.goto("/");
  await clerk.signIn({ page, emailAddress: email });

  // Land on a Member-gated route so MemberGate's ensureCurrentMember
  // mutation fires and creates/syncs the Convex members row for this
  // Clerk user before the storage state is captured.
  await page.goto("/");
  await page.getByText("Welcome,").waitFor();

  await page.context().storageState({ path: directorAuthFile });
});
