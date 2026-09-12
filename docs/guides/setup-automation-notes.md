# Setup automation notes

Working notes for [#10](https://github.com/hugoforte/ChoirManagement/issues/10) (agent-automated
stand-up: clone → one login per service → fully configured deployment). This is the **evidence
file** behind that issue: every environment step this project actually needs, each marked with
whether an agent can do it unattended or whether it needs a human in a browser.

Distinct from [`self-hosting.md`](./self-hosting.md), which is the human-facing walkthrough. This
file exists so the automation can be built from something better than memory — every entry below
was established by doing it for real against live Convex/Clerk/Vercel/GitHub, not read off a doc.

Legend: **[CLI]** automatable today · **[API]** automatable via REST, CLI can't · **[HUMAN]** needs
a browser · **[?]** unverified

## Convex

| Step | How | Notes |
|---|---|---|
| Create project | **[CLI]** `npx convex project create` | |
| Create prod deployment | **[CLI]** implicit on first `convex deploy` | |
| Create a persistent non-prod deployment | **[CLI]** `npx convex deployment create staging --type prod` | Do **not** pass `--expiration` for a prod-type deployment — the API rejects it (`InvalidExpiresAt`). Don't pass `--default` either (that would repoint `convex deploy`). |
| Mint a **deployment-scoped** deploy key | **[CLI]** `npx convex deployment token create <name> --deployment <ref>` | Emits `prod:<deployment-name>\|<token>`. This is what backs Vercel Preview here. |
| Mint a **preview-type** deploy key (`preview:<team>:<project>\|…`) | **[HUMAN]** Convex dashboard only | The CLI only exposes `/deployments/{name}/create_deploy_key`; there is no project-level/preview-key endpoint anywhere in the CLI bundle. Needed only for true per-branch ephemeral Convex backends — see the trade-off note below. |
| Set deployment env vars | **[CLI]** `npx convex env set K V --deployment-name <name>` (or `--prod`) | **Every deployment has its own env vars.** A newly created deployment starts empty, so `CLERK_JWT_ISSUER_DOMAIN` must be set per deployment or auth fails silently. |
| Deploy functions to a specific deployment | **[CLI]** `npx convex deploy --env-file <file>`, file holding `CONVEX_DEPLOY_KEY=…` | It's a Node process, so on Windows pass a Windows-style path (`cygpath -m`), not `/tmp/...`. |
| Seed a deployment | **[CLI]** `npx convex run seed:demo --deployment-name <name>` | `--preview-run` on `convex deploy` fires **only** for true preview deployments and is ignored for prod-type targets, so a shared staging deployment has to be seeded explicitly (once — it persists). |
| Inspect data | **[CLI]** `npx convex data <table> --deployment-name <name>` | |

The Convex CLI needs **Node ≥20** (it builds a RegExp with the `v` flag); on Node 18 every command
dies with `Invalid flags supplied to RegExp constructor 'v'`.

## Clerk

| Step | How | Notes |
|---|---|---|
| Create application / dev instance | **[HUMAN]** dashboard | |
| Get publishable + secret keys | **[CLI]** `npx clerk env pull --instance dev --file .env.test` | **`clerk auth login` only works on the machine running the browser** — it binds a `127.0.0.1:<port>` OAuth callback, so an agent sandboxed away from that browser can never complete the redirect. (Vercel's device-code flow has no such problem.) Run this one yourself. |
| Add `email` / `name` JWT claims | **[HUMAN]** dashboard → Sessions → "Customize session token" | Not the older "JWT Templates" screen. Without it, `identity.email`/`identity.name` are undefined and Member rows get blank names. |
| Create a test user | **[CLI]** `node scripts/e2e/ensure-clerk-test-user.mjs <email> <password>` | Uses `@clerk/backend`'s `users.createUser`; needs `CLERK_SECRET_KEY`. |
| Bypass CAPTCHA / bot protection in tests | **[CLI]** `@clerk/testing`'s `clerkSetup()` + `setupClerkTestingToken()` | `clerkSetup()` picks the publishable key up from `VITE_CLERK_PUBLISHABLE_KEY` (one of several fallbacks) and mints a testing token from `CLERK_SECRET_KEY`. |
| Sign in with no password and no email OTP | **[CLI]** `clerk.signIn({ page, emailAddress })` | Backend-API "ticket" strategy: looks the user up, mints a sign-in token, injects it into the client SDK. No UI form. Use a `+clerk_test` address so Clerk never sends real mail (it always accepts code `424242`). |
| Custom domain / production instance | **[HUMAN]** dashboard + DNS | Only needed for a real launch — see `self-hosting.md`. |

**On preview URLs**: Clerk *development* keys (`pk_test_`/`sk_test_`) are built to work on arbitrary
origins, ephemeral `*.vercel.app` included — dev instances carry session state in a `__clerk_db_jwt`
querystring parameter instead of an origin-bound cookie. Clerk *production* keys will never work on
`*.vercel.app`. **Verified working** on a real branch preview on 2026-09-11 (Clerk initialised, and the signed-out
redirect on `/` resolved rather than hanging). The earlier "Clerk can't do preview URLs" claim was a
misdiagnosis of preview builds that were failing for unrelated reasons — see [`../architecture/ci-cd-and-testing.md`](../architecture/ci-cd-and-testing.md).

## Vercel

| Step | How | Notes |
|---|---|---|
| Log in | **[CLI]** `npx vercel login` | Device-code flow, so it **works from a sandboxed agent** — no localhost callback. |
| Link project / git integration | **[HUMAN]** dashboard import | Deploys then happen on push; there is deliberately no GitHub Actions deploy job. |
| Build command | **[CLI]** commit it to `vercel.json` (`buildCommand`) | Preferred over the dashboard field: versioned, diffable, and readable by an agent with no dashboard access. **Must include `--check-build-environment disable`** — Convex otherwise refuses to deploy when it sees a non-production build environment (a Vercel Preview build) paired with a deploy key for a prod-*type* deployment, which is exactly the staging arrangement here. The guard is there to catch someone accidentally pointing previews at real production; it's a hidden flag (`--check-build-environment`, `enable`/`disable`). |
| Set env vars scoped per environment | **[API]** `POST /v10/projects/{id}/env` with `target: ["preview"]` | **Vercel CLI v54's `env add` can't target "all preview branches"**: it demands a branch, then re-suggests the exact command it just rejected. The REST API works. CLI credentials live in `AppData/Roaming/xdg.data/com.vercel.cli/auth.json` (`token` field). |
| Keep an env var readable | **[API]** `type: "plain"` | Vercel defaults new vars to *sensitive* = write-only, unreadable even via API — which once hid a **blank** `VITE_CLERK_PUBLISHABLE_KEY` that looked present in the dashboard list. Use `plain` for anything publishable so it stays verifiable. |
| Deployment Protection / SSO | **[API]** `PATCH /v9/projects/{id}` with `ssoProtection` | **Now `null` (disabled)** so preview URLs are publicly reachable and reviewable from any device without a Vercel login. Note there is **no "protect production, open previews"** option — the enum only offers `all`, `preview`, `prod_deployment_urls_and_all_previews`, so opening previews necessarily opens the production deployment URL too. Acceptable here: this is a public open-source app whose Events page is public by design, and everything member-only sits behind Clerk. Re-enable with `{"deploymentType":"all_except_custom_domains"}`. |
| Automation bypass secret | **[HUMAN]** dashboard (generate) | Consumed as `VERCEL_AUTOMATION_BYPASS_SECRET` by `playwright.config.ts` and CI. |
| Install a marketplace integration | **[HUMAN]**, and currently **broken** | `vercel integration add convex --plan CONVEX_BASE` still routes to a terms page that dies with `Missing billingPlanId for installation-only plan integration`. Sidestepped entirely by using a CLI-minted deployment-scoped key instead. |

## GitHub

| Step | How | Notes |
|---|---|---|
| Set Actions secrets | **[CLI]** `gh secret set NAME --body …` | Write-only; can't be read back to verify. |
| Branch protection | **[CLI]** `gh api -X PUT …/branches/main/protection --input <json>` | Must be **JSON input** — `-f`/`-F` can't express the nested booleans (`required_status_checks.strict` arrives as a string and is rejected). Needs a public repo or GitHub Pro. |
| Workflows | **[CLI]** commit the files | |

## Why a shared `staging` deployment instead of per-branch previews

Convex's per-branch preview deployments require a **preview-type** deploy key, which is
dashboard-only. A **deployment-scoped** key for one persistent `staging` deployment is fully
CLI-mintable, so an agent can stand the whole environment up unattended — which is the entire point
of #10. The trade-off: concurrent branches share one backend. That's acceptable for a
single-maintainer project, and it's reversible without touching any application code — swap the
value of Vercel's Preview `CONVEX_DEPLOY_KEY` for a preview-type key and per-branch isolation starts
working.

## Known remaining manual steps

1. Clerk application creation, plus the `email`/`name` session-token claims.
2. Clerk CLI login (must run on the human's own machine).
3. Vercel project creation / GitHub git-integration link.
4. Vercel automation-bypass-secret generation.
5. A preview-type Convex deploy key — *only* if per-branch backend isolation is wanted.

Everything else above is scriptable today.

## Loose ends

- `VITE_CONVEX_URL` exists as a project env var on **production + preview** with an **empty value**.
  Harmless (`convex deploy` injects the real URL into the build subprocess, which wins) but
  confusing; a candidate for deletion once confirmed unused.
