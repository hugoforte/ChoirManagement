# CI/CD & testing strategy

Resolved wayfinder ticket [#5](https://github.com/hugoforte/ChoirManagement/issues/5) — merged to `main`, and the deploy pipeline has been run for real against a live Vercel project + Convex production deployment (not just designed on paper). The exact test *surface* (which functions, which components) is intentionally left vague — that follows from the schema ticket (#2), long since resolved, but E2E coverage of it is still growing.

Revised after reviewing [hugoforte/hugo-tessa-20-years](https://github.com/hugoforte/hugo-tessa-20-years), a prior Convex project with a proven CI/CD + E2E setup worth adopting directly rather than reinventing.

## Deploy: no GitHub Actions deploy step

Vercel is the recommended frontend host (for both the maintainer's demo and, per the setup guide, self-hosters). Convex's own [Vercel integration](https://docs.convex.dev/production/hosting/vercel) means **deploy isn't a GitHub Actions job at all**: set Vercel's Build Command to `npx convex deploy --cmd 'npm run build'` with a `CONVEX_DEPLOY_KEY` env var (Production-scoped for `main`, Preview-scoped for PR branches — each PR gets its own isolated Convex backend). Push to the connected branch → Vercel builds and deploys the frontend, and `convex deploy` deploys the functions, together, natively. This removes the `deploy-prod.yml` / `deploy-demo.yml` workflows from the earlier draft entirely.

**Known constraint**: Clerk does not support ephemeral `vercel.app` preview URLs (it needs a custom domain), so authenticated E2E can't run against per-PR previews out of the box — see below.

## Workflows

1. **`pr-checks.yml`** — every PR and push to `main`: `npm run check` (typecheck `convex/`, typecheck the app, `vite build`) then `npm test` (Vitest + `convex-test`). Required status check before merge. **Confirmed green against real code.**
2. **`preview-playwright.yml`** — Playwright E2E, split into two jobs because of the Clerk/preview-URL constraint:
   - **`e2e-guest`**: every push and PR (skips draft PRs and fork PRs, mirrors the reference repo). Resolves that commit's Vercel deployment URL — *preview* normally, but *production* when the push is directly to `main`, since a main push never produces a preview deployment (Vercel deploys it straight to production; this ran for the full 10-minute timeout waiting for a preview that would never exist before the target logic was fixed to branch on this). Runs the unauthenticated `chromium-guest` project — this is exactly where the public Events site (ticket #7) gets exercised, since it needs no Clerk login. **Real and passing** (`e2e/public-events.spec.ts`).
   - **`e2e-authenticated`**: push to `main` only. Resolves the stable *production* URL, and would reseed demo data + run `chromium-admin`/`chromium-director`/`chromium-chorister` — **both of those steps are currently disabled (`if: false`)** in the workflow: `convex/seed.ts`'s `demo` function doesn't exist yet, and those three Playwright projects aren't defined in `playwright.config.ts` (no role-gated UI or test Clerk accounts exist yet to back them). Re-enable once both exist — don't just flip the flag blind.
   - Both jobs check for `VERCEL_TOKEN` / `VERCEL_PROJECT_ID` / `VERCEL_TEAM_ID` first and **skip with a notice, not a failure**, if absent — a self-hoster's fork without Vercel wired up doesn't get red CI for it. **These three secrets are set** on `hugoforte/ChoirManagement` as of this writing.

## Testing

- **Vitest** for unit tests and React component tests (Testing Library).
- **`convex-test`**, using `t.withIdentity()` (per the earlier auth research, [`docs/research/convex-clerk-integration-pattern.md`](../research/convex-clerk-integration-pattern.md)) to unit-test Role-based authorization without a real Clerk account or a full E2E run.
- **Playwright**, run against real deployed URLs only (never a CI-spun-up dev server) — `playwright.config.ts` reads `PLAYWRIGHT_BASE_URL` (default `localhost:5173`), confirmed running the same two tests locally and via `resolve-vercel-deployment-url.mjs` in CI.
- **Role-scoped Playwright projects** (`chromium-admin` / `chromium-director` / `chromium-chorister`, plus a `setup` project that logs in once per role and saves `storageState`): designed but **not yet built** — needs role-gated UI to actually assert against (beyond today's minimal `/` dashboard) and dedicated test Clerk accounts per role. Only `chromium-guest` exists today.

## Merge gate

A PR can merge once: `npm run check` passes, `npm test` passes, and `e2e-guest` passes (when Vercel secrets are configured — see skip behavior above). `e2e-authenticated` isn't a merge gate (it only runs post-merge, against production) — it's a post-merge safety net, not a blocker.

## Open questions for you

1. ~~Vercel as the recommended self-hosting frontend target~~ — resolved: recommended, with a manual "any static host" fallback documented in `docs/guides/self-hosting.md`.
2. Clerk's custom-domain requirement for previews to work: worth solving properly later (a documented custom preview-domain pattern), or is "guest-only E2E on previews, full role coverage post-merge on production" good enough for v1? Still open — moot until the authenticated E2E projects actually exist.
3. **New**: building `chromium-admin`/`chromium-director`/`chromium-chorister` needs dedicated test Clerk accounts per role. Where do those credentials live — GitHub secrets per role (`E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`, etc.), and are they created in the same Clerk Development instance used for local dev, or a separate one reserved for CI?
