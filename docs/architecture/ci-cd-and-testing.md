# CI/CD & testing strategy (draft)

PROTOTYPE — resolves wayfinder ticket [#5](https://github.com/hugoforte/ChoirManagement/issues/5). Committed on a throwaway branch (`prototype/ci-cd-pipeline`) for review; fold the accepted shape into `main` once confirmed. The exact test *surface* (which functions, which components) is intentionally left vague — that follows from the schema ticket (#2), still open.

## Pipelines

Three workflows, three different owners/triggers:

1. **`pr-checks.yml`** — every PR, every repo (upstream or a self-hoster's fork). Typecheck, lint, test. Required status check before merge.
2. **`deploy-prod.yml`** — a self-hoster's own fork, on merge to `main`. Runs the same checks, then deploys that Choir's Convex functions to their `prod` deployment and builds the frontend. Where the built frontend gets hosted is deliberately **not** prescribed here — that's the setup guide's call (#4), since it varies by self-hoster.
3. **`deploy-demo.yml`** — the upstream `hugoforte/ChoirManagement` repo only (guarded by a repository check), on merge to `main`. Deploys to a maintainer-owned demo Convex project, reseeds fake data, and publishes the frontend to GitHub Pages — zero extra hosting account, and GH Pages' native Actions integration keeps this workflow self-contained.

All three assume `CONVEX_DEPLOY_KEY`-style secrets scoped per-environment (`production` vs `demo`), which is Convex's own recommended pattern for CI deploys.

## Testing

- **Vitest** for unit tests and React component tests (Testing Library) — fits a Vite project natively, no separate runner to configure.
- **`convex-test`** for Convex functions, using `t.withIdentity()` to simulate authenticated Members with a given Role (per the auth research already on file, [`docs/research/convex-clerk-integration-pattern.md`](../research/convex-clerk-integration-pattern.md)) — this is how Role-based authorization checks get tested without a real Clerk account.
- **E2E (e.g. Playwright): explicitly deferred**, not part of the v1 test gate. Worth revisiting once there's a UI to click through; adding it now would test nothing.

## Merge gate

A PR can merge once: typecheck passes, lint passes, and `vitest` (including `convex-test` cases) passes. No coverage threshold proposed for v1 — revisit once the schema and first functions exist and there's something real to measure coverage against.

## Open question for you

Frontend hosting target for **self-hosters'** prod deploys (not the demo, which is pinned to GitHub Pages above) is left unspecified — `deploy-prod.yml` stops at producing a build artifact. Worth deciding in the setup guide ticket (#4): recommend one target (e.g. "any static host, here's an nginx example") or stay fully open-ended?
