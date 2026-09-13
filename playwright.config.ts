import { defineConfig, devices } from "@playwright/test";

// chromium-guest and chromium-production-smoke are Clerk-free. The former is
// the deterministic, seeded preview suite; the latter is a read-only suite
// for the stable production alias. chromium-director and chromium-admin each
// sign in once via their own setup project (e2e/auth.setup.ts,
// e2e/auth-admin.setup.ts) using @clerk/testing's email-based ticket sign-in
// against a "+clerk_test" Clerk account, then reuse the saved storageState —
// no UI form automation, no real email. Separate setup projects per Role so
// a broken account for one Role can't block the other's E2E. chromium-chorister
// doesn't exist yet (no chorister-only UI to test against). See
// docs/architecture/ci-cd-and-testing.md.
//
// chromium-guest-clerk is neither of those: it's anonymous (no storageState,
// no dependencies), but it's not Clerk-free either, because it hits a gated
// route whose useAuth() needs Clerk's SDK to actually boot. It rides in
// preview-playwright.yml's e2e-authenticated job instead of e2e-guest's, so
// it inherits CLERK_SECRET_KEY and can call setupClerkTestingToken to bypass
// bot detection — chromium-guest's job carries no Clerk secret at all, by
// design, and a Clerk-touching test placed there hung past every timeout in
// CI even though it passed reliably run standalone (see e2e/gate-redirect.spec.ts).

const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const bypassHeaders = bypassSecret
  ? {
      "x-vercel-protection-bypass": bypassSecret,
      "x-vercel-set-bypass-cookie": "true",
    }
  : undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    extraHTTPHeaders: bypassHeaders,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium-guest",
      testMatch: /public-events\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-production-smoke",
      testMatch: /production-smoke\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "setup-admin",
      testMatch: /auth-admin\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "setup-clerk-anon",
      testMatch: /clerk-anon\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-director",
      testMatch: /(library-manage|events-manage|access-denied)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: ".auth/director.json" },
      dependencies: ["setup"],
    },
    {
      name: "chromium-admin",
      testMatch: /(settings-manage|members-manage)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: ".auth/admin.json" },
      dependencies: ["setup-admin"],
    },
    {
      name: "chromium-guest-clerk",
      testMatch: /gate-redirect\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup-clerk-anon"],
    },
  ],
});
