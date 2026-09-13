import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";

// Registers Clerk's Frontend API URL so setupClerkTestingToken can bypass
// bot detection for an anonymous test (gate-redirect.spec.ts) — no sign-in,
// no storageState, deliberately not reusing e2e/auth.setup.ts's "setup"
// project so a broken director Clerk account can't block an unrelated
// anonymous test from running.
setup("register Clerk Frontend API (no sign-in)", async () => {
  await clerkSetup();
});
