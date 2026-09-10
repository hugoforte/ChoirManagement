# Self-hosting setup guide (draft)

PROTOTYPE — resolves wayfinder ticket [#4](https://github.com/hugoforte/ChoirManagement/issues/4), part of the map "ChoirManagement v1 architecture spec" ([#1](https://github.com/hugoforte/ChoirManagement/issues/1)). Committed on a throwaway branch (`prototype/setup-guide`) for review; fold the accepted shape into `main` once confirmed.

This guide walks a volunteer "technical Member" through standing up their own ChoirManagement instance. It assumes comfort with copy-pasting terminal commands and following dashboard UIs, but no prior experience with Convex, Clerk, or Vercel.

**Read this first if you're reviewing the draft, not following it as a self-hoster:** the repo currently has `convex/schema.ts` and architecture docs, but no `package.json`, no frontend code, and no `convex/` functions beyond the schema. This guide documents the *target* setup flow per the accepted architecture (ADR-0001, ADR-0002, ADR-0003, `docs/architecture/ci-cd-and-testing.md`), for a repo state that hasn't fully landed yet. Every place that depends on not-yet-built pieces is called out inline as **TODO**, and summarized at the end.

## What you'll need

Four accounts total, all free at the scale of a single choir (tens to low hundreds of Members):

1. **GitHub** — to fork the repo.
2. **Convex** ([convex.dev](https://convex.dev)) — your choir's database and backend functions.
3. **Clerk** ([clerk.com](https://clerk.com)) — your choir's login (Google + username/password).
4. **Vercel** ([vercel.com](https://vercel.com)) — hosts the frontend and triggers your deploys.

Each Choir gets its **own** Convex project and **own** Clerk application — never share one Clerk app or Convex project across choirs (see ADR-0001, ADR-0002). Keep that in mind if you're setting this up for more than one choir: repeat the whole guide per choir.

---

## Step 1 — Fork the repo

1. Go to [github.com/hugoforte/ChoirManagement](https://github.com/hugoforte/ChoirManagement) and click **Fork**. Leave the name as `ChoirManagement` unless you have a reason to rename it.
2. Clone your fork locally:
   ```
   git clone https://github.com/<your-github-username>/ChoirManagement.git
   cd ChoirManagement
   ```
3. Keep your fork's `main` branch as the branch you deploy from — that's what Vercel will watch (Step 4).

## Step 2 — Create your Convex Cloud project

1. Sign up / log in at [dashboard.convex.dev](https://dashboard.convex.dev) with the account that should own this choir's data.
2. From your local clone, run:
   ```
   npx convex dev
   ```
   The first run asks you to log in (opens a browser) and then to create a new project — name it after your choir, e.g. `riverside-choir`. This provisions **two** Convex deployments under one project: a `dev` deployment (for local development, the one `npx convex dev` connects to) and a `prod` deployment (what your live site will use).
3. Leave `npx convex dev` running while you work locally — it pushes your schema/functions to the `dev` deployment and keeps a local `.env.local` file with your dev deployment's URL. You don't need it running for the production deploy in Step 5; that happens through Vercel instead.
4. Note your project's **deployment URL** (shown in the dashboard, `https://<your-project>.convex.cloud`) — you'll need the production one in Step 4.

## Step 3 — Create your Clerk application

1. Sign up / log in at [dashboard.clerk.com](https://dashboard.clerk.com).
2. **Create application** — name it after your choir. Under sign-in options, enable:
   - **Google** (social connection)
   - **Username/Email + Password** (Clerk calls this the "Password" strategy under Email/Username)

   Per ADR-0002, these two are the only sign-in methods this app supports — leave other social providers off unless you have a specific reason to add them.
3. **Google OAuth**: Clerk's Google social connection works out of the box with Clerk's own shared OAuth credentials for development. For a real (non-throwaway) choir deployment, use your own Google OAuth client instead: in Clerk's dashboard, under **User & Authentication → Social Connections → Google**, toggle "Use custom credentials" and follow Clerk's linked instructions to create a Web OAuth client in [Google Cloud Console](https://console.cloud.google.com/), pasting Clerk's provided redirect URI into it. Copy the resulting Client ID/Secret back into Clerk.
4. **Activate the Convex integration and JWT template.** This is the step most likely to be misconfigured, per the auth research (`docs/research/convex-clerk-integration-pattern.md`, on the unmerged `research/clerk-convex-auth-pattern` branch):
   - In the Clerk dashboard, go to **Configure → JWT Templates**, and use the **Convex** template (or create one if it's not offered directly — Clerk's setup page at `dashboard.clerk.com/apps/setup/convex` pre-populates it).
   - **Verify the template is named exactly `convex`** (lowercase, no suffix). Convex's own docs flag "failing to name the JWT template `convex`" as the single most common Clerk misconfiguration.
   - Leave the template's claims at their default — Convex reads the `aud` claim (which the template sets to `"convex"`) and matches it against `applicationID` in `auth.config.ts` (Step 4). Don't add a custom `role` claim — Role lives on the `members` table, not the JWT (see the research doc for why: a confirmed `convex@1.34.0` regression could silently drop custom claims).
5. Copy your Clerk application's **Frontend API URL** (under **Configure → API Keys**, or the "Domains" screen — looks like `https://verb-noun-00.clerk.accounts.dev` for a Development instance). You'll wire this into Convex in Step 4. Also copy the **Publishable key** from the same screen.

   **Note on Development vs. Production Clerk instances**: this guide uses Clerk's default **Development** instance, which works immediately on Vercel's default `<project>.vercel.app` domain with no DNS setup. Clerk's **Production** instances require you to put your own custom domain in front of both your app and Clerk — useful once you have one, but extra setup this guide doesn't cover (see TODOs at the end).

## Step 4 — Connect Clerk to Convex, and set up Vercel

### 4a. Point Convex at your Clerk app

`auth.config.ts` doesn't exist in this repo yet (it's documented, not yet merged — see TODOs). Once it (or the equivalent scaffold) exists in your fork, it should look like:

```ts
// convex/auth.config.ts
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
};
```

Set the env var on your **Convex** project (not Vercel — this is backend-only config), using the Frontend API URL from Step 3.5:

```
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://verb-noun-00.clerk.accounts.dev
```

**Careful**: Convex's docs name this variable `CLERK_JWT_ISSUER_DOMAIN`; Clerk's own current docs call the same value `CLERK_FRONTEND_API_URL`. Both describe the identical `auth.config.ts` shape and value — pick one name (this guide uses Convex's), set it consistently, and re-check both vendors' docs if auth fails with "no auth provider found matching the given token."

Run `npx convex dev` (or `npx convex deploy` once you have a `prod` deployment) after adding/editing `auth.config.ts` — Convex won't pick up auth config changes otherwise.

### 4b. Create the Vercel project

1. Sign up / log in at [vercel.com](https://vercel.com), then **Add New → Project**, and import your GitHub fork.
2. Framework preset: Vite (Vercel should auto-detect this once the frontend scaffold exists — see TODOs).
3. Override the **Build Command** to:
   ```
   npx convex deploy --cmd 'npm run build'
   ```
   This is the whole deploy mechanism — Convex's Vercel integration means there's no separate GitHub Actions deploy job. One command deploys your Convex functions *and* builds the static frontend together (see `docs/architecture/ci-cd-and-testing.md`).
4. Add environment variables, in Vercel's project **Settings → Environment Variables**:

   | Name | Value | Scope |
   |---|---|---|
   | `CONVEX_DEPLOY_KEY` | a **Production** deploy key from your Convex project (Convex dashboard → your project → switch to the `prod` deployment → **Settings → Deploy Keys** → generate one; copy it immediately, it's shown once) | Production |
   | `VITE_CONVEX_URL` | your Convex project's **production** deployment URL (`https://<your-project>.convex.cloud`, prod deployment — not the dev one) | Production (and Preview, if you want PR previews to work) |
   | `VITE_CLERK_PUBLISHABLE_KEY` | the Publishable key from Step 3.5 | Production (and Preview) |

   The exact `VITE_`-prefixed variable names above follow the standard Vite+Convex+Clerk convention (Vite only exposes env vars prefixed `VITE_` to client code) but aren't yet confirmed against real app code in this repo — see TODOs.

## Step 5 — First deploy

1. Push a commit to your fork's `main` branch (even a trivial one, if you haven't changed anything) — this is what triggers Vercel's git integration.
2. Watch the deploy in the Vercel dashboard's **Deployments** tab. The build log should show `npx convex deploy` running first (pushing your schema and functions to the `prod` Convex deployment) followed by `npm run build`.
3. If the build fails on `npx convex deploy` with an auth error, double check `CONVEX_DEPLOY_KEY` is the **Production**-scoped key from the correct project. If it fails on the Clerk/JWT side once the app loads, re-check Step 4a (issuer domain value, JWT template name).

## Step 6 — Verify it works

1. Open the URL Vercel gives your project (`https://<your-project>.vercel.app`).
2. Per the current (still-draft, unconfirmed) route map in `docs/architecture/frontend-routes.md`, you should land on `/` — a home page showing your choir's name (from the `choirSettings` singleton — see TODOs on how that gets its first value) and a sign-in affordance.
3. Go to `/sign-in` and sign in with Google or create a username/password account. This should create your `members` record on first login (create-on-first-login pattern, per the auth research) — you should see yourself listed if you can reach `/members`.
4. **You'll land as a Chorister, not an Admin** — see the first-admin TODO below. You will not be able to reach Director/Admin-only management views until that's resolved.

If any of this fails, the most likely culprits, in order: Clerk JWT template not literally named `convex`; `CLERK_JWT_ISSUER_DOMAIN` value mismatched or using the wrong (dev vs. prod) Clerk instance's Frontend API URL; `VITE_CONVEX_URL` pointing at your `dev` deployment instead of `prod`.

---

## Fallback: deploying without Vercel

Vercel is the recommended path (native Convex build-command integration, and it's what the CI/CD design in `docs/architecture/ci-cd-and-testing.md` assumes) — but nothing about the app requires it. Because the frontend is a Vite-built static SPA (ADR-0003), you can host it anywhere that serves static files:

1. Run the deploy yourself instead of letting Vercel trigger it:
   ```
   npx convex deploy --cmd 'npm run build'
   ```
   (using a `CONVEX_DEPLOY_KEY` env var set locally, from the same Convex dashboard screen as Step 4b). This deploys your Convex functions and produces a static `dist/` folder.
2. Upload `dist/` to any static host (GitHub Pages, Netlify, Cloudflare Pages, your own web server, etc.), making sure `VITE_CONVEX_URL` and `VITE_CLERK_PUBLISHABLE_KEY` were set in your environment *before* running `npm run build` (Vite bakes them in at build time, not runtime).
3. You lose Vercel's automatic redeploy-on-push — you'll need to rerun the two commands above yourself (or wire your own CI) every time you want to publish a change.

## Troubleshooting

- **"No auth provider found matching the given token"** — `applicationID`/`domain` mismatch between Clerk's JWT and `auth.config.ts`. Decode the JWT (e.g. via jwt.io) and compare its `aud`/`iss` claims against `applicationID`/`domain`.
- **"This deployment has no configured authentication providers"** in the Convex dashboard — you edited `auth.config.ts` or the env var but haven't run `npx convex dev`/`deploy` since.
- **Custom claims (if you ever add any) missing from `getUserIdentity()`** — check your `convex` package version; a known regression in `convex@1.34.0`'s `ConvexProviderWithClerk` could silently drop the `"convex"` JWT template. (This repo doesn't add custom claims by default — Role is read from the `members` table — so this shouldn't bite you unless you deviate from the documented pattern.)

## Open questions / TODOs for the human

1. **No app scaffold exists yet.** `package.json`, frontend source, and `convex/` functions beyond `schema.ts` (including `auth.config.ts` itself) aren't in the repo as of this draft. Every command in this guide (`npm install`, `npm run dev`/`build`/`check`, the `auth.config.ts` shape) is the documented *target* shape from the architecture docs, not yet verified against real code. Worth re-reviewing this guide once that scaffold lands.
2. **First-admin bootstrap is unspecified.** New Members default to Role `chorister` on first login (per the auth research's recommendation, to avoid self-assigned elevated access). No ticket says how the *first* Member on a brand-new deployment becomes Admin, since there's no existing Admin to promote them. Needs a decision — options include a one-time seed script that sets the first-ever Member to Admin, or documenting a manual edit via the Convex dashboard's data browser as the sanctioned bootstrap step.
3. **Frontend routes (#6) and public/private auth architecture (#7) are both still open**, and #6's route map explicitly depends on #7's unresolved routing mechanics. The "verify it works" step above references `/`, `/sign-in`, `/members` from the current draft route table — these paths may still change.
4. **Clerk Development instance + Vercel's default domain, not a custom domain**, is the path this guide documents, to avoid requiring a self-hoster to already own/configure DNS. This mirrors an already-open question in `docs/architecture/ci-cd-and-testing.md` (custom-domain handling for Clerk, currently only "solved" for post-merge production E2E, not for self-hosting generally) — worth a joint decision on whether v1's setup guide should push self-hosters toward a Production Clerk instance + custom domain instead.
5. **Bulk-import of the existing ~1000-song library (#8, open) is out of scope here.** A freshly set-up instance starts with an empty Music Library; importing the existing library is a separate, not-yet-built tool.
6. **Frontend env var names** (`VITE_CONVEX_URL`, `VITE_CLERK_PUBLISHABLE_KEY`) are a reasonable convention but not yet confirmed against real app code — double-check once the frontend scaffold (see TODO 1) exists.
