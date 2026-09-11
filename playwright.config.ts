import { defineConfig, devices } from "@playwright/test";

// chromium-guest is Clerk-free. chromium-director signs in once (the
// "setup" project, e2e/auth.setup.ts) via @clerk/testing's email-based
// ticket sign-in against a dedicated "+clerk_test" Clerk account, then
// reuses the saved storageState — no UI form automation, no real email.
// chromium-admin/chromium-chorister don't exist yet (no admin/chorister-only
// UI to test against). See docs/architecture/ci-cd-and-testing.md.

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
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-director",
      use: { ...devices["Desktop Chrome"], storageState: ".auth/director.json" },
      dependencies: ["setup"],
    },
  ],
});
