# Setup automation notes

Working notes for [#10](https://github.com/hugoforte/ChoirManagement/issues/10) (agent-automated
stand-up: clone → one login per service → fully configured deployment). This is the **evidence
file** behind that issue: every environment step this project actually needs, whether it can be
automated, and the traps that will bite whoever writes the automation.

Distinct from [`self-hosting.md`](./self-hosting.md), which is the human-facing walkthrough.
Everything below was established by doing it for real against live Convex/Clerk/Vercel/GitHub — not
read off a doc. Where something is unverified it says so.

Legend: **[CLI]** automatable via a CLI · **[API]** automatable via REST (no CLI path) ·
**[HUMAN]** needs a browser · **[?]** unverified

## The stand-up sequence

Ordered as automation would actually run it. Only steps 1–4 need a human, and they're all account
creation or consent.

| # | Step | Who |
|---|---|---|
| 1 | Create a Clerk application (development instance) | **[HUMAN]** |
| 2 | Clerk → Sessions → "Customize session token": add `email` and `name` claims | **[HUMAN]** |
| 3 | Create a Vercel project and connect it to the GitHub repo | **[HUMAN]** |
| 4 | Generate Vercel's "Protection Bypass for Automation" secret — only if Deployment Protection stays on | **[HUMAN]** |
| 5 | `npx convex login`, `npx vercel login`, `gh auth login` | **[CLI]** — Vercel uses a device code; Convex and gh open a browser |
| 6 | `npx clerk auth login && npx clerk env pull --instance dev --file .env.test` | **[CLI]**, but **must run on the human's own machine** (see Clerk table) |
| 7 | Create the Convex project + production deployment | **[CLI]** `npx convex project create`; prod is implicit on first `convex deploy` |
| 8 | Mint a **preview** deploy key | **[API]** `POST /v1/projects/{id}/create_preview_deploy_key` |
| 9 | Mint a **production** deploy key | **[CLI]** `npx convex deployment token create <name> --prod` |
| 10 | Convex project-level env defaults for preview deployments (`CLERK_JWT_ISSUER_DOMAIN`, `ALLOW_DEMO_SEED`) | **[CLI]** `npx convex env default set K V --type preview` |
| 11 | `CLERK_JWT_ISSUER_DOMAIN` on the production deployment | **[CLI]** `npx convex env set K V --prod` |
| 12 | Create the Clerk test users and publish `SEED_ROLE_MEMBERS` | **[CLI]** `node scripts/e2e/seed-role-members.mjs --publish-default` |
| 13 | Vercel env vars per environment (`CONVEX_DEPLOY_KEY` ×2 scopes, `VITE_CLERK_PUBLISHABLE_KEY` ×2 scopes) | **[API]** — the CLI can't do "all preview branches" |
| 14 | GitHub Actions secrets | **[CLI]** `gh secret set` |
| 15 | Branch-protect `main` | **[CLI]** `gh api -X PUT … --input <json>` |
| 16 | Push a branch → verify the preview provisions its own Convex backend and seeds itself | **[CLI]** |

## Convex

| Step | How | Notes |
|---|---|---|
| Create project | **[CLI]** `npx convex project create` | |
| Create prod deployment | **[CLI]** implicit on first `convex deploy` | |
| Create a persistent named deployment | **[CLI]** `npx convex deployment create <ref> --type <dev\|prod\|preview>` | Don't pass `--expiration` for a prod-type deployment — the API rejects it (`InvalidExpiresAt`). Don't pass `--default` unless you mean to repoint `convex deploy`. |
| Mint a **deployment-scoped** key | **[CLI]** `npx convex deployment token create <name> --deployment <ref>` | Emits `prod:<deployment-name>\|<token>`. |
| Mint a **preview-type** key | **[API]** `POST https://api.convex.dev/v1/projects/{project_id}/create_preview_deploy_key`, body `{"name":"…"}` | Returns `preview:<team>:<project>\|<token>` in a **`previewDeployKey`** field. Also `list_preview_deploy_keys` / `delete_preview_deploy_key`. **The CLI cannot mint one** — it only ever calls `/deployments/{name}/create_deploy_key`, which is what led two earlier versions of this file to wrongly record this as dashboard-only. [Docs](https://docs.convex.dev/management-api/create-preview-deploy-key). |
| **Authenticating the Management API** | **[CLI]** reuse `~/.convex/config.json` → `accessToken` as `Authorization: Bearer …` | **Verified** (`list_preview_deploy_keys` → `200`). The docs point at a dashboard-issued *team access token*, but the CLI's own login token works — so **no dashboard step is needed**. This is the single fact that makes the whole stand-up automatable. |
| Set env vars on one deployment | **[CLI]** `npx convex env set K V --deployment-name <name>` (or `--prod`) | **Every deployment has its own env vars**, and a new one starts empty. |
| Env var defaults inherited by *new* deployments | **[CLI]** `npx convex env default set K V --type <dev\|prod\|preview>` | `--type` scopes them, so preview defaults never leak into production. Check with `npx convex env default list --type prod` (empty here). |
| Deploy to a specific deployment | **[CLI]** `npx convex deploy --env-file <file>` holding `CONVEX_DEPLOY_KEY=…` | Node process — on Windows pass a Windows-style path (`cygpath -m`), not `/tmp/...`. |
| Auto-seed a newly provisioned preview | **[CLI]** `npx convex deploy --preview-run <fn>` | Fires **only** when the deploy routes through a *preview* key and provisions a new deployment; silently ignored for deployment-scoped keys. **A throwing seed does not fail the build** — it surfaces as an empty preview, not a red check. |
| Seed an existing deployment | **[CLI]** `npx convex run seed:demo --deployment-name <name>` | |
| Inspect data | **[CLI]** `npx convex data <table> --deployment-name <name>` | |
| Tear down a deployment | **[API]** `POST /v1/deployments/{name}/delete` | No CLI equivalent. |

Limits: **40 deployments per team** on the free plan (300 Pro). Preview deployments count toward
that cap and are **auto-deleted 5 days** after creation (14 on paid). Preview deployments are a
beta feature. Free-plan resource quotas are team-wide totals, so many live previews share one
budget. ([limits](https://docs.convex.dev/production/state/limits),
[preview-deployments](https://docs.convex.dev/production/hosting/preview-deployments))

The Convex CLI needs **Node ≥20** — it builds a RegExp with the `v` flag, so on Node 18 every
command dies with `Invalid flags supplied to RegExp constructor 'v'`.

## Clerk

| Step | How | Notes |
|---|---|---|
| Create application / dev instance | **[HUMAN]** dashboard | |
| Get publishable + secret keys | **[CLI]** `npx clerk env pull --instance dev --file .env.test` | **`clerk auth login` only works on the machine running the browser** — it binds a `127.0.0.1:<port>` OAuth callback, so an agent sandboxed away from that browser can never complete the redirect. (Vercel's device-code flow has no such problem.) |
| Add `email` / `name` JWT claims | **[HUMAN]** dashboard → Sessions → "Customize session token" | Not the older "JWT Templates" screen. Without it `identity.email`/`identity.name` are undefined and Member rows get blank names. |
| Create test users, one per Role | **[CLI]** `node scripts/e2e/seed-role-members.mjs` | Creates any missing user via `@clerk/backend`'s `users.createUser`; needs `CLERK_SECRET_KEY`. |
| Derive the issuer without an API call | **[CLI]** base64-decode the publishable key | `pk_test_<base64 of "host$">` → `https://<host>`. Lets token identifiers be assembled offline. |
| Bypass CAPTCHA / bot protection in tests | **[CLI]** `@clerk/testing`'s `clerkSetup()` + `setupClerkTestingToken()` | `clerkSetup()` reads the publishable key from `VITE_CLERK_PUBLISHABLE_KEY` (one of several fallbacks) and mints a testing token from `CLERK_SECRET_KEY`. |
| Sign in with no password and no OTP | **[CLI]** `clerk.signIn({ page, emailAddress })` | Backend-API "ticket" strategy: looks the user up, mints a sign-in token, injects it into the client SDK. No UI form. Use a `+clerk_test` address — Clerk never sends real mail for those and always accepts the code `424242`. |
| Custom domain / production instance | **[HUMAN]** dashboard + DNS | Only for a real launch — see `self-hosting.md`. |

**On preview URLs**: Clerk *development* keys (`pk_test_`/`sk_test_`) work on arbitrary origins,
ephemeral `*.vercel.app` included — dev instances carry session state in a `__clerk_db_jwt`
querystring parameter rather than an origin-bound cookie. Clerk *production* keys never work
there. **Verified working** on a real branch preview: Clerk initialised, and the signed-out
redirect on `/` resolved instead of hanging. The earlier "Clerk can't do preview URLs" claim in
this repo was a misdiagnosis of preview builds that were failing for unrelated reasons.

## Vercel

| Step | How | Notes |
|---|---|---|
| Log in | **[CLI]** `npx vercel login` | Device-code flow, so it **works from a sandboxed agent**. |
| Link project / git integration | **[HUMAN]** dashboard import | Deploys then happen on push; there is deliberately no GitHub Actions deploy job. |
| Build command | **[CLI]** commit it to `vercel.json` (`buildCommand`) | Preferred over the dashboard field: versioned, diffable, readable by an agent with no dashboard access. Current value: `npx convex deploy --cmd 'npm run build' --preview-run seed:preview`. |
| Set env vars scoped per environment | **[API]** `POST /v10/projects/{id}/env` with `target: ["preview"]` | **Vercel CLI v54's `env add` cannot target "all preview branches"**: it demands a branch, then re-suggests the exact command it just rejected. Use the REST API. |
| **Authenticating the Vercel API** | **[CLI]** reuse `AppData/Roaming/xdg.data/com.vercel.cli/auth.json` → `token` | Note this is *not* `com.vercel.cli/Data/config.json`, which holds only telemetry. |
| Keep an env var readable | **[API]** `type: "plain"` | Vercel defaults new vars to *sensitive* = write-only, unreadable even via API — which once hid a **blank** `VITE_CLERK_PUBLISHABLE_KEY` that looked present in the dashboard. Use `plain` for anything publishable so it stays verifiable. |
| Deployment Protection / SSO | **[API]** `PATCH /v9/projects/{id}` with `ssoProtection` | **Currently `null` (disabled)** so preview URLs are reviewable from any device without a Vercel login. There is **no "protect production, open previews"** option — the enum is `all` / `preview` / `prod_deployment_urls_and_all_previews` — so opening previews necessarily opens the production deployment URL too. Acceptable here: public open-source app, public Events page by design, everything member-only behind Clerk. Re-enable with `{"deploymentType":"all_except_custom_domains"}`. |
| Read the automation bypass secret | **[API]** `GET /v9/projects/{id}` → `protectionBypass` | Only needed while SSO protection is on. |
| Find the deployment for a commit | **[API]** `GET /v6/deployments?projectId=…&state=READY`, match `meta.githubCommitSha` | What `scripts/ci/resolve-vercel-deployment-url.mjs` does. Preview deployments have `target: null`. |
| Stable per-branch URL | — | Each deployment also gets a branch alias (`…-git-<branch>-<team>.vercel.app`) that follows new commits — better to hand a human than the per-deployment hash URL. |
| Install a marketplace integration | **[HUMAN]**, currently **broken** | `vercel integration add convex --plan CONVEX_BASE` routes to a terms page that dies with `Missing billingPlanId for installation-only plan integration`. Not needed — the Management API route above replaces it. |

## GitHub

| Step | How | Notes |
|---|---|---|
| Set Actions secrets | **[CLI]** `gh secret set NAME --body …` | Write-only; can't be read back to verify. |
| Branch protection | **[CLI]** `gh api -X PUT …/branches/main/protection --input <json>` | Must be **JSON input** — `-f`/`-F` can't express the nested booleans (`required_status_checks.strict` arrives as a string and is rejected). Needs a public repo or GitHub Pro. |
| Workflows | **[CLI]** commit the files | |

## How a per-branch environment becomes usable with no human in the loop

1. Push a branch → Vercel builds it with the **preview-scoped** `CONVEX_DEPLOY_KEY`.
2. Because that's a preview-type key, `convex deploy` **provisions a new backend named after the
   git branch** (e.g. `preview/chore-branch-pr-workflow` → `ardent-bullfrog-181`).
3. The new deployment inherits `CLERK_JWT_ISSUER_DOMAIN`, `ALLOW_DEMO_SEED` and
   `SEED_ROLE_MEMBERS` from the **preview-type project defaults** — no per-deployment setup.
4. `--preview-run seed:preview` seeds demo content **and one Member per Role**.
5. Anyone can sign in as `e2e-admin+clerk_test@hugoforte.com` (or `-director`, `-chorister`) and
   already hold that Role.

Why seeding a Member works with **no change to the auth path**: `members.ensureCurrentMember`
matches on `clerkUserId` and, for an existing row, patches only name/email — never `role`. So a
seeded Role survives that user's first sign-in (`convex/seed.test.ts` asserts exactly this). Clerk
users are shared across deployments (one dev instance ⇒ stable issuer), so only the Member rows
need seeding per backend; `SEED_ROLE_MEMBERS` carries the `<issuer>|<clerk_user_id>` token
identifiers because a Convex mutation can't call Clerk's Backend API.

This is the [hugo-tessa-20-years](https://github.com/hugoforte/hugo-tessa-20-years) model (fresh
backend + `--preview-run` + a test user per role) with one deliberate difference: that repo grants
admin via a hardcoded `PERMANENT_ADMIN_EMAILS` allowlist in source, which is fine for a private
single-purpose site but wrong here — ChoirManagement gets forked and self-hosted, and a fork would
inherit the maintainer's email as a permanent admin of someone else's choir. Seeded Member rows
achieve the same thing without that.

`ALLOW_DEMO_SEED` gates both seed functions and is set only on preview-type defaults, so demo
content and Role grants cannot be aimed at a real choir's production deployment.

## Traps that will bite the automation

- **Spawning the Convex CLI from Node on Windows.** `shell: true` lets cmd.exe mangle the quotes
  and `|` in a JSON argument (yields `JSON5: invalid character 'h'` on the `https://` in
  `clerkUserId`); `shell: false` can't spawn `npx.cmd` at all on Node ≥20 (`EINVAL`). Fix: run
  `process.execPath` against `node_modules/convex/bin/main.js` — and resolve that path **by path**,
  not `require.resolve`, because convex's `exports` map doesn't expose `./bin/main.js`.
- **`GITHUB_SHA` on a `pull_request` event** is a synthetic merge commit Vercel never builds, so
  matching deployments on it polls forever. Use `github.event.pull_request.head.sha`.
- **Double workflow triggers.** `push: ["**"]` plus `pull_request` starts two runs per commit that
  race for the same deployment; the loser hits the job timeout and is cancelled, and a cancelled
  *required* check blocks the merge even with a green twin. Trigger `push` on `main` only.
- **Writing JSON via shell heredocs** silently ate a backslash from the SPA-rewrite regex in
  `vercel.json`, producing invalid JSON (`\.` instead of `\\.`) and a build that failed before it
  started. Generate JSON with a real serializer.
- **A failing `--preview-run` seed does not fail the Vercel build.** Empty preview, green check.

## Remaining manual steps

1. Clerk application creation, plus the `email`/`name` session-token claims.
2. Clerk CLI login (must run on the human's own machine).
3. Vercel project creation / GitHub git-integration link.
4. Vercel automation-bypass-secret generation — only if Deployment Protection is re-enabled.

Everything else above is scriptable today.

## Loose ends

- `VITE_CONVEX_URL` exists as a project env var on **production + preview** with an **empty
  value**. Harmless (`convex deploy` injects the real URL into the build subprocess, which wins)
  but confusing; a candidate for deletion once confirmed unused.
- The `staging` deployment (`formal-ibex-796`) and its deploy key are now **unused** — nothing has
  pointed at them since preview builds moved to per-branch backends. Safe to delete; kept for the
  moment as a fallback.
- Two preview deploy keys exist (`vercel-preview`, `vercel-preview-active`); only the latter is
  wired into Vercel. The former should be deleted.
- `e2e-authenticated` still runs only post-merge against production. Now that Clerk is confirmed
  working on previews, it could run on the PR itself against the branch's own seeded backend.
