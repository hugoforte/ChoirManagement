import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    // Vitest's default glob also matches e2e/*.spec.ts, which belongs to
    // Playwright's own test runner - the two collide ("Playwright Test did
    // not expect test() to be called here") if Vitest picks them up too.
    include: ["convex/**/*.test.ts"],
  },
});
