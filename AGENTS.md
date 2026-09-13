# Agent Instructions: ChoirManagement

This file is the single source of truth for coding agents in this repository — `.github/copilot-instructions.md` and `CLAUDE.md` are lightweight redirects here (plus whatever tool-managed content they carry, e.g. the `<!-- convex-ai-start -->` block below).

Workflow and conventions below are adapted from [hugoforte/hugo-tessa-20-years](https://github.com/hugoforte/hugo-tessa-20-years)'s `.github/copilot-instructions.md` — a prior Convex project with the same stack and a proven workflow, worth reusing rather than reinventing. Two conventions deliberately **kept different** from that source, both because they already match what's built and tested here: error handling (throw, not discriminated-union returns) and function naming (verb-first camelCase, not `action_noun`).

## Project Overview

**ChoirManagement** is an open-source, self-hosted web app for choirs to manage their music library, member roster, and event scheduling. See `CONTEXT.md` for domain vocabulary and `docs/adr/` for architecture decisions.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues in `hugoforte/ChoirManagement`, using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout: `CONTEXT.md` + `docs/adr/` at the repo root (created lazily as needed). See `docs/agents/domain.md`.

## Convex First-Read Rule

- When working on Convex code, always read `convex/_generated/ai/guidelines.md` first.
- Treat that guidelines file as higher priority than generic Convex patterns from model memory.
- If Convex AI files are stale, refresh them with `npx convex ai-files update`.

**Technology Stack**

| Layer | Technology | Version |
|-------|-----------|---------|
| **Backend** | Convex | ^1.45 |
| **Frontend** | React + Vite + Tailwind CSS | React 19 / Vite 6 / Tailwind 3 |
| **Auth** | Clerk | ^5.31 |
| **E2E Testing** | Playwright | ^1.55 |
| **Language** | TypeScript | ^5.7 |
| **Package Manager** | npm | — |
| **Frontend host** | Vercel (recommended, not required — see `docs/guides/self-hosting.md`) | — |

## Repository Structure

```
ChoirManagement/
├── .github/
│   ├── copilot-instructions.md      # Redirects here
│   └── workflows/
│       ├── pr-checks.yml            # typecheck + vitest, every PR/push to main
│       └── preview-playwright.yml   # Preview E2E + read-only production smoke
│
├── convex/                          # Convex backend (TypeScript)
│   ├── schema.ts                    # Data model & tables
│   ├── auth.config.ts               # Clerk JWT issuer wiring
│   ├── lib/auth.ts                  # requireMember/requireCan helpers
│   ├── lib/capabilities.ts          # Role → Capability table (see #28)
│   ├── public.ts                    # Unauthenticated-safe functions only
│   ├── *.ts                         # Other query/mutation functions
│   ├── *.test.ts                    # convex-test unit tests
│   └── _generated/                  # AUTO-GENERATED, committed (see below) — do not hand-edit
│       ├── api.d.ts / api.js
│       ├── server.d.ts / server.js
│       ├── dataModel.d.ts
│       └── ai/guidelines.md         # Convex API patterns & rules
│
├── e2e/                             # Playwright specs
├── src/
│   ├── App.tsx, main.tsx
│   ├── routes/                      # One file per route (see docs/architecture/frontend-routes.md)
│   ├── test/setup.ts                # jsdom polyfills (matchMedia, localStorage) + jest-dom matchers
│   └── **/*.test.{ts,tsx}           # Vitest + Testing Library, jsdom (see #34)
│
├── docs/
│   ├── adr/                         # Architecture decision records
│   ├── architecture/                # CI/CD design, schema notes, frontend route map
│   ├── guides/self-hosting.md       # Step-by-step self-hosting walkthrough
│   ├── guides/setup-automation-notes.md  # What's automatable per service, + traps (#10)
│   ├── research/                    # Point-in-time research docs
│   └── agents/                      # Issue tracker + domain-doc conventions for agents
│
├── scripts/ci/                      # CI helper scripts (e.g. Vercel deployment URL resolver)
├── scripts/e2e/                     # Clerk test users + per-Role Member seeding
├── vercel.json                      # Build command + SPA rewrite
├── playwright.config.ts
├── vitest.config.ts                 # convex/**/*.test.ts (edge-runtime) + src/**/*.test.{ts,tsx} (jsdom) — don't let it pick up e2e/
└── CONTEXT.md                       # Domain vocabulary
```

**`convex/_generated/` is committed, not gitignored** — per Convex's own CLI guidance ("your code won't typecheck without it"), and it's how `pr-checks.yml` typechecks without needing a live Convex deploy key in CI.

No path-specific `.github/instructions/*.instructions.md` files yet — the codebase is small enough (one vertical slice) that this single file covers it. Split them out once `convex/`, `src/`, and `e2e/` each have enough going on that a path-specific guide would actually save time over reading this file.

## Build & Run Commands

### Prerequisites
- Node.js ≥ 20 (older versions crash some `npx convex` subcommands with a cryptic RegExp error — see `package.json`'s `engines` field)
- A Convex account and a Clerk account (see `docs/guides/self-hosting.md` for first-time setup)

### Development Setup
```bash
npm install
npm run dev   # frontend (vite) + backend (convex dev) together
```

### Production Deployment
Vercel's git integration deploys on push to `main` — no GitHub Actions deploy job. Build Command lives in `vercel.json` (`buildCommand`), versioned rather than set in the Vercel dashboard: `npx convex deploy --cmd 'npm run build' --preview-run seed:preview`. See `docs/architecture/ci-cd-and-testing.md` and `docs/guides/self-hosting.md`.

## Testing

```bash
npm run check     # tsc (convex + app) + vite build
npm test          # vitest run (convex/**/*.test.ts + src/**/*.test.{ts,tsx})
npm run test:e2e  # playwright test
```

Current suite shape:

- `convex/*.test.ts`: convex-test unit tests, using `t.withIdentity()` to simulate authenticated Members. Runs under `environment: "edge-runtime"`.
- `src/**/*.test.{ts,tsx}`: Vitest + `@testing-library/react`, under `environment: "jsdom"` (`vitest.config.ts`'s `environmentMatchGlobs`) — pure-function tests (`src/lib/*.test.ts`) and component/hook tests that mock `@clerk/clerk-react` and `convex/react` at the module boundary rather than standing up a real Clerk/Convex/Router stack (see #34). `src/test/convexMocks.ts` holds the one cast every `useMutation`/`useQuery` mock needs (`ReactMutation`'s real return type isn't structurally satisfied by a plain `vi.fn()`); compare a query reference with `getFunctionName` (from `convex/server`), never `===` — `api.foo.bar` is a fresh Proxy on every access.
- `e2e/public-events.spec.ts`: the `chromium-guest` project — Clerk-free and deterministic against auto-seeded preview deployments. Its seeded Event assertions must not run against production.
- `e2e/production-smoke.spec.ts`: the `chromium-production-smoke` project — Clerk-free, read-only, and seed-independent. It checks the stable production alias after each `main` deployment and daily; an optional `PRODUCTION_PUBLIC_EVENT_ID` repository variable enables a real public Event detail canary.
- `e2e/library-manage.spec.ts` and `e2e/events-manage.spec.ts`: the `chromium-director` project, signed in via `e2e/auth.setup.ts`.
- `e2e/settings-manage.spec.ts` and `e2e/members-manage.spec.ts`: the `chromium-admin` project, signed in as `admin+clerk_test@example.com` (the same account every preview seeds for manual review — no dedicated secret needed). `chromium-chorister` isn't built yet — no chorister-only UI to assert against — but its Clerk account and seeded Member row already exist (`scripts/e2e/seed-role-members.mjs`).
- Each project is scoped with `testMatch`; without it every project runs every spec, which made `chromium-guest` try to run the director test.

## Validation Steps

Before committing code:

1. **Project validation**: `npm run check` (typecheck + build)
2. **Unit tests**: `npm test`
3. **Behavior check**: the narrowest relevant Playwright spec, if the change touches anything in `e2e/`'s scope: `npx playwright test --project=chromium-guest`
4. **Preview validation**: after pushing, confirm the Vercel deployment and both GitHub Actions workflows (`CI checks`, `Playwright E2E`) succeed — `gh run list --repo hugoforte/ChoirManagement --limit 3`

## CI/CD Pipeline

See `docs/architecture/ci-cd-and-testing.md` for the full design and status. Summary:

- `.github/workflows/pr-checks.yml`: `npm run check` + `npm test`, every PR (any base branch — required for stacked PRs via `gh stack` to report status) and every push to `main`.
- `.github/workflows/preview-playwright.yml`: `e2e-guest` and `e2e-authenticated` run on PRs against that branch's own preview deployment (`chromium-director` and `chromium-admin` are real — see `e2e/auth.setup.ts` / `e2e/auth-admin.setup.ts`). `production-smoke` runs read-only against the stable production alias after pushes to `main` and daily. `chromium-chorister` doesn't exist yet (no chorister-only UI). Deliberately **not** triggered on `push: "**"`: that fires twice per PR commit and a cancelled duplicate blocks the merge.
- Vercel git integration: builds + deploys on push, no separate deploy workflow. A push to a feature branch gets its own isolated preview deployment (separate URL, separate Convex backend) — production is untouched until the branch merges to `main`.
- Requires `VERCEL_TOKEN`/`VERCEL_PROJECT_ID`/`VERCEL_TEAM_ID`/`VERCEL_AUTOMATION_BYPASS_SECRET` as GitHub secrets for preview E2E (already set on this repo); preview jobs skip gracefully if a self-hoster's fork lacks them. Scheduled production smoke needs no credentials.
- **`main` is branch-protected**: PRs required (0 approvals needed — solo project), `check` and `e2e-guest` must pass before merge. Direct pushes to `main` are blocked for this reason, not just by convention.

## Feature Delivery Workflow

When asked for a feature rather than a small tweak, prefer this end-to-end path:

1. Create a feature branch (`git checkout -b feat/<slug>`) — don't push straight to `main`. Feature-sized work deploys to an isolated Vercel preview + Convex backend on that branch, so production is never touched until merge.
2. Implement the feature and add/update the smallest relevant test coverage (`convex/*.test.ts` for backend logic, an `e2e/` spec for new user-visible behavior — respecting the Clerk/preview-URL constraint above).
3. Run the validation steps above locally before pushing.
4. Commit and push the branch, then open a PR.
5. Confirm `check` and `e2e-guest` pass on the PR, then **manually verify the feature on the PR's preview deployment URL** (the branch alias, which follows new commits). Each branch gets its own isolated Convex backend, auto-seeded with demo content and one Member per Role — so sign in as `admin+clerk_test@example.com` (or `director+…`/`chorister+…`), password `a`, and you already hold that Role with nothing to run by hand. Authenticated `chromium-director` E2E runs on the PR against this same backend.
6. Merge the PR once checks are green and preview verification looks right.
7. Confirm the production Vercel deployment and both GitHub Actions workflows (now running against `main`) succeed post-merge.
8. Report back with: the PR reference, the production deployment URL, and a concise validation summary (what you ran, what passed, both pre-merge on preview and post-merge on production).

Don't skip tests for user-facing changes unless the environment makes them genuinely impossible (e.g. a Clerk-dependent flow blocked by the preview-URL limitation above).

### Multi-PR efforts with real cross-PR dependencies: use `gh stack`

When a larger effort splits into several PRs and one genuinely depends on another's changes (not just "created around the same time" — actually touches lines the other PR introduced), use the [`gh stack`](https://docs.github.com/en/pull-requests/how-tos/stacked-pull-requests) extension (`gh extension install github/gh-stack`) instead of hand-basing a branch on another feature branch and manually rebasing after it merges:

- `gh stack init <branch>` / `gh stack add <branch>` to build the chain locally.
- `gh stack submit` to push every layer and open/update all the PRs at once.
- `gh stack sync` to pull `main`, cascade-rebase the whole stack, and resync PR state — this is the step that replaces manually rebasing a dependent branch after its predecessor merges.
- `gh stack view` / `gh stack checkout <pr-number>` to inspect or switch between layers.
- `gh stack link <pr-a> <pr-b> ...` to retroactively wire already-open PRs into a tracked stack (bottom to top) without recreating branches.

Don't force independent PRs into a stack just because they shipped together — check actual file overlap first. Only chain PRs that would otherwise conflict or depend on each other's code.

**`pr-checks.yml`'s `pull_request` trigger has no `branches:` filter for exactly this reason**: `main`'s branch protection requires the `check` status, and a stacked PR targets an intermediate branch, not `main` — if the workflow only fired for `main`-targeting PRs, `check` would sit as "Expected" forever on every non-bottom layer and block the whole stack from merging.

## Core Development Rules

### Convex Backend

1. **Always validate function arguments and returns** using Convex validators (`v.*`) — every `query`, `mutation`, `internalMutation` etc. needs `args` and a `returns` validator.
2. **Errors: throw, don't return discriminated unions.** `convex/lib/auth.ts`'s `requireMember`/`requireCan` throw plain `Error`s on failure — this matches Convex's own official `guidelines.md`, not a return-value error-object pattern. Stay consistent with this.
3. **Role lives on the `members` table, not a JWT claim** — a confirmed `convex@1.34.0` regression could silently drop custom claims; see `docs/research/convex-clerk-integration-pattern.md`.
4. **Public functions live in `convex/public.ts` only**, and that module must never query `rsvps` or `members` — the public/private boundary is enforced by which functions exist where, not by a conditional inside a shared function.
5. **`ctx.db.get`/`patch`/`delete`: prefer the table-qualified two-argument form** (`ctx.db.get("members", id)`) in new code, per current Convex guidelines.
6. **No N+1 without reason** — use indexes (`.withIndex`), bound `.collect()`/`.take()`, and `Promise.all()` for parallel per-item fetches (see `convex/public.ts`'s `setlistTitles` helper for the pattern).
7. **Never read the wall clock inside a query** — pass `now` in as an argument (see `convex/events.ts`'s `listUpcoming`).

### Frontend

8. **`ConvexProviderWithClerk` wrapper is required** (not plain `ConvexProvider`) — see `src/main.tsx`. Without it, auth tokens don't get sent with requests.
9. **Gate `requireMember`-backed queries behind `members.viewer` resolving to a real Member first**, not just `isSignedIn` — there's a real race between Clerk reporting signed-in and the `ensureCurrentMember` mutation actually creating the row (see `src/routes/Home.tsx`'s `HomeContentForMember` split; this caused a real white-screen crash once).
10. **Preserve preview-safe routing** — `vercel.json`'s SPA rewrite must keep working for any new client-side route (confirmed necessary: a direct navigation to a client-routed path 404'd for real before this was added).
11. **Ship tests with user-visible behavior changes** — prefer extending `e2e/public-events.spec.ts` or adding a narrowly-scoped new spec over a broad new suite.

## Naming Conventions

- **Convex functions**: verb-first camelCase (`ensureCurrentMember`, `bootstrapFirstAdmin`, `listUpcoming`) — matches Convex's own docs examples. Internal-only functions use `internalMutation`/`internalQuery`, not a naming prefix.
- **Tables**: plural (`members`, `pieces`, `events`, `rsvps`).
- **Indexes**: `by_<field>` or `by_<field>_and_<field>`, always naming every field the index covers, in query order (see `convex/schema.ts`).
- **Constants**: `SCREAMING_SNAKE_CASE`.
- **React components/files**: `PascalCase.tsx`, one route per file under `src/routes/`.

## Dependency Guidelines

Before adding a dependency: is it necessary, what's the size impact, is it well-maintained, does `npm audit` flag it, does it duplicate something Convex already provides (real-time sync, auth via Clerk, database)? Don't add a separate state-management or data-fetching library — Convex's `useQuery`/`useMutation` hooks are the data layer.

## Convex-Specific Resources

- **Convex API Guidelines**: `convex/_generated/ai/guidelines.md`
- **Convex Agent Skills**: available via the `convex-*` skills installed under `.claude/skills/` and `.agents/skills/` (see `convex-reviewer`, `convex-docs`, `convex-authz`, etc.)
- **Convex Documentation**: https://docs.convex.dev

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
