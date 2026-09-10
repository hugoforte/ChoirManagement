# CI/CD & testing strategy (draft)

PROTOTYPE — resolves wayfinder ticket [#5](https://github.com/hugoforte/ChoirManagement/issues/5). Committed on a throwaway branch (`prototype/ci-cd-pipeline`) for review; fold the accepted shape into `main` once confirmed. The exact test *surface* (which functions, which components) is intentionally left vague — that follows from the schema ticket (#2), still open.

Revised after reviewing [hugoforte/hugo-tessa-20-years](https://github.com/hugoforte/hugo-tessa-20-years), a prior Convex project with a proven CI/CD + E2E setup worth adopting directly rather than reinventing.

## Deploy: no GitHub Actions deploy step

Vercel is the recommended frontend host (for both the maintainer's demo and, per the setup guide, self-hosters). Convex's own [Vercel integration](https://docs.convex.dev/production/hosting/vercel) means **deploy isn't a GitHub Actions job at all**: set Vercel's Build Command to `npx convex deploy --cmd 'npm run build'` with a `CONVEX_DEPLOY_KEY` env var (Production-scoped for `main`, Preview-scoped for PR branches — each PR gets its own isolated Convex backend). Push to the connected branch → Vercel builds and deploys the frontend, and `convex deploy` deploys the functions, together, natively. This removes the `deploy-prod.yml` / `deploy-demo.yml` workflows from the earlier draft entirely.

**Known constraint**: Clerk does not support ephemeral `vercel.app` preview URLs (it needs a custom domain), so authenticated E2E can't run against per-PR previews out of the box — see below.

## Workflows

1. **`pr-checks.yml`** — every PR and push to `main`: `npm run check` (typecheck `convex/`, typecheck the app, `vite build`) then `npm test` (Vitest + `convex-test`). Required status check before merge.
2. **`preview-playwright.yml`** — Playwright E2E, split into two jobs because of the Clerk/preview-URL constraint:
   - **`e2e-guest`**: every push and PR (skips draft PRs and fork PRs, mirrors the reference repo). Resolves that commit's Vercel *preview* URL, runs only the unauthenticated `chromium-guest` project — this is exactly where the public Events site (ticket #7) gets exercised, since it needs no Clerk login.
   - **`e2e-authenticated`**: push to `main` only. Resolves the stable *production* URL (custom domain, Clerk works), reseeds demo data (upstream repo only, guarded by `github.repository`), and runs the full `chromium-admin` / `chromium-director` / `chromium-chorister` projects.
   - Both jobs check for `VERCEL_TOKEN` / `VERCEL_PROJECT_ID` / `VERCEL_TEAM_ID` first and **skip with a notice, not a failure**, if absent — a self-hoster's fork without Vercel wired up doesn't get red CI for it.

## Testing

- **Vitest** for unit tests and React component tests (Testing Library).
- **`convex-test`**, using `t.withIdentity()` (per the earlier auth research, [`docs/research/convex-clerk-integration-pattern.md`](../research/convex-clerk-integration-pattern.md)) to unit-test Role-based authorization without a real Clerk account or a full E2E run.
- **Playwright**, run against real deployed URLs only (never a CI-spun-up dev server) — `playwright.config.ts` should read `PLAYWRIGHT_BASE_URL` (default `localhost:5173`) so the same suite runs locally and in CI, exactly as in the reference repo.
- **Role-scoped Playwright projects**: a `setup` project logs in once per role and saves `storageState`, reused by `chromium-guest` / `chromium-admin` / `chromium-director` / `chromium-chorister` — avoids re-authenticating per test and gives a natural place to assert what each Role can and can't see (e.g. a Chorister project asserting the Member roster's admin actions aren't rendered).

## Merge gate

A PR can merge once: `npm run check` passes, `npm test` passes, and `e2e-guest` passes (when Vercel secrets are configured — see skip behavior above). `e2e-authenticated` isn't a merge gate (it only runs post-merge, against production) — it's a post-merge safety net, not a blocker.

## Open questions for you

1. Confirmed you're OK with **Vercel** as the recommended self-hosting frontend target (not just the demo) — should this go in the setup guide (#4) as *the* documented path, or as *a* documented path alongside a manual "any static host" alternative for self-hosters who don't want a Vercel account?
2. Clerk's custom-domain requirement for previews to work: worth solving properly later (a documented custom preview-domain pattern), or is "guest-only E2E on previews, full role coverage post-merge on production" good enough for v1?
