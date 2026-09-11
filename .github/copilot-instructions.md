# Agent Instructions: ChoirManagement

Adapted from [hugoforte/hugo-tessa-20-years](https://github.com/hugoforte/hugo-tessa-20-years)'s `.github/copilot-instructions.md` — a prior Convex project with the same stack and a proven workflow, worth reusing rather than reinventing. Two conventions deliberately **kept different** from that source, both because they already match what's built and tested here (see below): error handling (throw, not discriminated-union returns) and function naming (verb-first camelCase, not `action_noun`).

## Project Overview

**ChoirManagement** is an open-source, self-hosted web app for choirs to manage their music library, member roster, and event scheduling. See `CONTEXT.md` for domain vocabulary and `docs/adr/` for architecture decisions.

## Instruction Source of Truth

This file is the authoritative instruction set for coding agents in this repository.

- If guidance conflicts between files, follow this file.
- `AGENTS.md` and `CLAUDE.md` are lightweight redirect files and should point back to this file (plus whatever tool-managed content they carry — see the `<!-- convex-ai-start -->` blocks in each).
- No path-specific `.github/instructions/*.instructions.md` files yet — the codebase is small enough (one vertical slice) that this single file covers it. Split them out once `convex/`, `src/`, and `e2e/` each have enough going on that a path-specific guide would actually save time over reading this file.

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
│   ├── copilot-instructions.md      # This file
│   └── workflows/
│       ├── pr-checks.yml            # typecheck + vitest, every PR/push to main
│       └── preview-playwright.yml   # E2E: chromium-guest on preview, more roles pending
│
├── convex/                          # Convex backend (TypeScript)
│   ├── schema.ts                    # Data model & tables
│   ├── auth.config.ts               # Clerk JWT issuer wiring
│   ├── lib/auth.ts                  # requireMember/requireRole helpers
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
│   └── routes/                      # One file per route (see docs/architecture/frontend-routes.md)
│
├── docs/
│   ├── adr/                         # Architecture decision records
│   ├── architecture/                # CI/CD design, schema notes, frontend route map
│   ├── guides/self-hosting.md       # Step-by-step self-hosting walkthrough
│   ├── research/                    # Point-in-time research docs
│   └── agents/                      # Issue tracker + domain-doc conventions for agents
│
├── scripts/ci/                      # CI helper scripts (e.g. Vercel deployment URL resolver)
├── vercel.json                      # Build command + SPA rewrite
├── playwright.config.ts
├── vitest.config.ts                 # Scoped to convex/**/*.test.ts — don't let it pick up e2e/
└── CONTEXT.md                       # Domain vocabulary
```

**`convex/_generated/` is committed, not gitignored** — per Convex's own CLI guidance ("your code won't typecheck without it"), and it's how `pr-checks.yml` typechecks without needing a live Convex deploy key in CI.

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
Vercel's git integration deploys on push to `main` — no GitHub Actions deploy job. Build Command is `npx convex deploy --cmd 'npm run build'` (set in Vercel project settings, mirrored by `vercel.json`'s rewrite-only config). See `docs/architecture/ci-cd-and-testing.md` and `docs/guides/self-hosting.md`.

## Testing

```bash
npm run check     # tsc (convex + app) + vite build
npm test          # vitest run (convex/**/*.test.ts only)
npm run test:e2e  # playwright test
```

Current suite shape:

- `convex/*.test.ts`: convex-test unit tests, using `t.withIdentity()` to simulate authenticated Members.
- `e2e/public-events.spec.ts`: `chromium-guest` project only — deliberately never touches `/` or anything calling Clerk's `useAuth()`, because Clerk doesn't reliably support ephemeral `vercel.app`-style deployment URLs (confirmed by hitting exactly this in CI, not just documented preemptively). `chromium-admin`/`chromium-director`/`chromium-chorister` projects are designed (see `docs/architecture/ci-cd-and-testing.md`) but not yet built — no role-gated UI or test Clerk accounts exist yet to back them.

## Validation Steps

Before committing code:

1. **Project validation**: `npm run check` (typecheck + build)
2. **Unit tests**: `npm test`
3. **Behavior check**: the narrowest relevant Playwright spec, if the change touches anything in `e2e/`'s scope: `npx playwright test --project=chromium-guest`
4. **Preview validation**: after pushing, confirm the Vercel deployment and both GitHub Actions workflows (`CI checks`, `Playwright E2E`) succeed — `gh run list --repo hugoforte/ChoirManagement --limit 3`

## CI/CD Pipeline

See `docs/architecture/ci-cd-and-testing.md` for the full design and status. Summary:

- `.github/workflows/pr-checks.yml`: `npm run check` + `npm test`, every PR and push to `main`.
- `.github/workflows/preview-playwright.yml`: `e2e-guest` (every push/PR, against that commit's resolved Vercel deployment — preview normally, production when the push is directly to `main`) and `e2e-authenticated` (push to `main` only; its role-project and demo-reseed steps are currently `if: false` pending role-gated UI, test accounts, and a `seed.ts` — don't flip them on blind).
- Vercel git integration: builds + deploys on push, no separate deploy workflow.
- Requires `VERCEL_TOKEN`/`VERCEL_PROJECT_ID`/`VERCEL_TEAM_ID`/`VERCEL_AUTOMATION_BYPASS_SECRET` as GitHub secrets (already set on this repo) — both E2E jobs skip gracefully, not fail, if a self-hoster's fork doesn't have them.

## Feature Delivery Workflow

When asked for a feature rather than a small tweak, prefer this end-to-end path:

1. Create or use a dedicated feature branch (or work directly on `main` for small, low-risk changes — this repo doesn't currently require PRs, but use judgment).
2. Implement the feature and add/update the smallest relevant test coverage (`convex/*.test.ts` for backend logic, an `e2e/` spec for new user-visible behavior — respecting the Clerk/preview-URL constraint above).
3. Run the validation steps above locally before pushing.
4. Commit and push.
5. Confirm the Vercel deployment and both GitHub Actions workflows succeed.
6. Report back with: the commit/branch reference, the deployment URL, and a concise validation summary (what you ran, what passed).

Don't skip tests for user-facing changes unless the environment makes them genuinely impossible (e.g. a Clerk-dependent flow blocked by the preview-URL limitation above).

## Core Development Rules

### Convex Backend

1. **Always validate function arguments and returns** using Convex validators (`v.*`) — every `query`, `mutation`, `internalMutation` etc. needs `args` and a `returns` validator.
2. **Errors: throw, don't return discriminated unions.** `convex/lib/auth.ts`'s `requireMember`/`requireRole` throw plain `Error`s on failure — this matches Convex's own official `guidelines.md`, not a return-value error-object pattern. Stay consistent with this.
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
