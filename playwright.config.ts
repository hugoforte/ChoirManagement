import { defineConfig, devices } from "@playwright/test";

// Only chromium-guest is real right now — no role-gated UI or test Clerk
// accounts exist yet to back chromium-admin/director/chorister projects.
// See docs/architecture/ci-cd-and-testing.md for the plan; the workflow
// steps that would use those projects are deliberately disabled
// (.github/workflows/preview-playwright.yml) until they exist, rather than
// referencing projects that don't.

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
  ],
});
