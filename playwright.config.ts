import { defineConfig, devices } from "@playwright/test";

// chromium-guest is Clerk-free. chromium-director and chromium-admin each
// sign in once via their own setup project (e2e/auth.setup.ts,
// e2e/auth-admin.setup.ts) using @clerk/testing's email-based ticket sign-in
// against a "+clerk_test" Clerk account, then reuse the saved storageState —
// no UI form automation, no real email. Separate setup projects per Role so
// a broken account for one Role can't block the other's E2E. chromium-chorister
// doesn't exist yet (no chorister-only UI to test against). See
// docs/architecture/ci-cd-and-testing.md.

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
      name: "chromium-director",
      testMatch: /library-manage\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: ".auth/director.json" },
      dependencies: ["setup"],
    },
    {
      name: "chromium-admin",
      testMatch: /settings-manage\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: ".auth/admin.json" },
      dependencies: ["setup-admin"],
    },
  ],
});
