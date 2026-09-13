import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Needed for src/**/*.test.tsx — this config isn't merged with
  // vite.config.ts, so the React plugin has to be repeated here too.
  plugins: [react()],
  test: {
    environment: "edge-runtime",
    // src/ tests run under jsdom instead — real DOM APIs for Testing
    // Library, rather than convex/'s edge-runtime default (there's no DOM
    // to render into there in the first place).
    environmentMatchGlobs: [["src/**", "jsdom"]],
    setupFiles: ["./src/test/setup.ts"],
    server: { deps: { inline: ["convex-test"] } },
    // Vitest's default glob also matches e2e/*.spec.ts, which belongs to
    // Playwright's own test runner - the two collide ("Playwright Test did
    // not expect test() to be called here") if Vitest picks them up too.
    include: ["convex/**/*.test.ts", "src/**/*.test.{ts,tsx}"],
  },
});
