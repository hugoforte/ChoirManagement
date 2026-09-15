# Self-hosting setup guide

Resolved wayfinder ticket [#4](https://github.com/hugoforte/ChoirManagement/issues/4), part of the map "ChoirManagement v1 architecture spec" ([#1](https://github.com/hugoforte/ChoirManagement/issues/1)) — merged to `main`. Being actively corrected as the vertical slice gets validated against real accounts (see below); not a finished, hands-off document yet.

This guide walks a volunteer "technical Member" through standing up their own ChoirManagement instance. It assumes comfort with copy-pasting terminal commands and following dashboard UIs, but no prior experience with Convex, Clerk, or Vercel.

**Read this first if you're reviewing the draft, not following it as a self-hoster:** a real vertical slice (`package.json`, `convex/` functions, a working React app for `/`, `/sign-in`, `/public/events`) now exists on the `feat/scaffold-vertical-slice` branch, validated by actually running it against a live Convex dev deployment and a real Clerk app — this guide's steps below have been corrected against what that validation actually found, not just the original architecture docs. Anything still purely speculative (routes/features beyond the vertical slice) is still called out as **TODO**.

## What you'll need

Four free accounts, plus one small recurring cost, plus a Node version check:

1. **GitHub** — to fork the repo.
2. **Convex** ([convex.dev](https://convex.dev)) — your choir's database and backend functions. Free at the scale of a single choir.
3. **Clerk** ([clerk.com](https://clerk.com)) — your choir's login (Google + username/password). **Free** — Clerk's Hobby plan (no credit card, 50,000 monthly active users/app) explicitly includes custom-domain support, which is what item 5 is for.
4. **Vercel** ([vercel.com](https://vercel.com)) — hosts the frontend and triggers your deploys. Free tier is enough.
5. **A domain you own** (e.g. via Namecheap, Cloudflare Registrar, ~$10-15/year) — the one real cost in this whole setup, and it's not about Clerk's pricing. Clerk's **Development** instance type (distinct from the Hobby/paid *plan* question — this is about environment, not billing) is capped at 100 users and explicitly unsupported for production use per Clerk's own docs, so a real choir needs a **Production** instance, and Production requires a custom domain regardless of which Clerk plan you're on. You're not paying Clerk for this — you're paying a domain registrar, and Clerk itself stays free. **You don't need this yet** — see the note in Step 3; it's only required when you get to Step 5's real deploy, not for local development.
6. **Node.js 20 or newer** on your machine. Check with `node --version` before starting — Vite 6 and the current Convex CLI both silently misbehave on older versions (a couple of `npx convex` subcommands crash outright on Node 18 with a cryptic `RegExp` error). If you use `nvm`, `nvm install 20` (or later) and `nvm use 20`.

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
3. **Expected error, not a bug**: because `convex/auth.config.ts` already references a `CLERK_JWT_ISSUER_DOMAIN` env var, `npx convex dev` will print something like `Environment variable CLERK_JWT_ISSUER_DOMAIN is used in auth config file but its value was not set`, with a dashboard link to set it. That's fine — the project and dev deployment are already created at this point; you're just not done configuring auth yet. Move on to Step 3, then come back and set that variable in Step 4a.
4. Leave `npx convex dev` running while you work locally — it pushes your schema/functions to the `dev` deployment and keeps a local `.env.local` file with your dev deployment's URL (`CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL`, `VITE_CONVEX_SITE_URL`). You don't need it running for the production deploy in Step 5; that happens through Vercel instead.
5. **Don't overwrite `.env.local` wholesale** once it exists — e.g. if you're hand-editing it to add `VITE_CLERK_PUBLISHABLE_KEY` (Step 3), *append*, don't replace the file. If you clobber the `CONVEX_DEPLOYMENT` line and then run `npx convex dev` again, it won't error — it'll silently create a brand-new **local, anonymous** deployment instead of reconnecting to your real cloud project, and you'll wonder why nothing you set up shows up. If that happens, reconnect explicitly:
   ```
   npx convex dev --configure existing --team <your-team-slug> --project <your-project-slug> --dev-deployment cloud
   ```
6. Note your project's **deployment URL** (shown in the dashboard, `https://<your-project>.convex.cloud`) — you'll need the production one in Step 4.

## Step 3 — Create your Clerk application

**For now, stay on Clerk's default Development instance** — no domain needed yet. Production + your custom domain (Step 3b) is only required when you get to Step 5's real deploy, not for local development.

1. Sign up / log in at [dashboard.clerk.com](https://dashboard.clerk.com).
2. **Create application** — name it after your choir. Under sign-in options, enable:
   - **Google** (social connection)
   - **Username/Email + Password** (Clerk calls this the "Password" strategy under Email/Username)

   Per ADR-0002, these two are the only sign-in methods this app supports — leave other social providers off unless you have a specific reason to add them.
3. **Google OAuth**: Clerk's Google social connection works out of the box with Clerk's own shared OAuth credentials for development. For a real (non-throwaway) choir deployment, use your own Google OAuth client instead: in Clerk's dashboard, under **User & Authentication → Social Connections → Google**, toggle "Use custom credentials" and follow Clerk's linked instructions to create a Web OAuth client in [Google Cloud Console](https://console.cloud.google.com/), pasting Clerk's provided redirect URI into it. Copy the resulting Client ID/Secret back into Clerk.
4. **Connect the Convex integration.** Clerk now has a dedicated wizard for this (`dashboard.clerk.com/apps/setup/convex`, or a "Convex" entry point from the Clerk dashboard) — noticeably easier than manually building a JWT template:
   - Select your organization/app, and **Development** as the instance (matches what you're doing right now).
   - Click **Activate Convex integration** — this creates a JWT template (named `convex`) with the `aud: "convex"` claim wired automatically. You don't have to build this by hand.
   - Once active, the wizard reveals the exact env var and value to add — that's your `CLERK_JWT_ISSUER_DOMAIN` (a Development instance's looks like `https://verb-noun-00.clerk.accounts.dev`).
5. **Add email and name to the session token claims — the wizard's default does NOT include them.** Verified by actually signing in against a real deployment: without this step, every Member's `name`/`email` come through empty, and `ensureCurrentMember` falls back to a generic "New Member." In the Clerk dashboard, go to **Sessions → Customize session token** (current Clerk UI merges what used to be a separately-named JWT template into this one screen — you'll see `"aud": "convex"` already there under **Managed claims: Convex**, confirming this is the right token). Add to the Claims JSON, using the `user.primary_email_address` / `user.full_name` shortcode buttons rather than typing the syntax by hand:
   ```json
   {
     "aud": "convex",
     "email": "{{user.primary_email_address}}",
     "name": "{{user.full_name}}"
   }
   ```
   Add the two new lines alongside the existing `"aud": "convex"` — don't replace it.
   Convex's claim mapping is a strict 1:1 on OIDC-standard names — `identity.email` only populates from a claim literally named `email`, `identity.name` only from `name`. Don't add a custom `role` claim, though — Role lives on the `members` table, not the JWT (see `docs/research/convex-clerk-integration-pattern.md`: a confirmed `convex@1.34.0` regression could silently drop custom claims).
6. Copy your Clerk application's **Frontend API URL** and **Publishable key**, both under **Configure → API Keys**. You'll wire the Frontend API URL into Convex in Step 4, and the Publishable key into your frontend env in Step 4b.

### Step 3b — Later: switch to Production for your real deploy

When you're ready to actually put this live for your choir (not before): go to **Configure → Domains** in the Clerk dashboard, switch from Development to **Production**, and enter the domain you own (see "What you'll need"). Clerk will show DNS records (typically a `CNAME` under a `clerk.` subdomain) to add at your registrar. Point your Vercel project at this same domain too (Vercel's project **Settings → Domains**), so your app and Clerk agree on one real domain rather than mixing a `vercel.app` URL with a Clerk custom domain. DNS propagation can take minutes to a few hours. Re-copy the Frontend API URL and Publishable key once you're on Production — they change from the Development instance's values.

## Step 4 — Connect Clerk to Convex, and set up Vercel

### 4a. Point Convex at your Clerk app

`convex/auth.config.ts` (part of the vertical slice, merged to `main`) looks like this:

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

Set the env var on your **Convex** project (not Vercel — this is backend-only config), using the Frontend API URL from Step 3.6 (a Development instance's, for now — you'll set this again with the Production value once you get to Step 3b/Step 5):

```
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://verb-noun-00.clerk.accounts.dev
```

**Careful**: Convex's docs name this variable `CLERK_JWT_ISSUER_DOMAIN`; Clerk's own current docs call the same value `CLERK_FRONTEND_API_URL`. Both describe the identical `auth.config.ts` shape and value — pick one name (this guide uses Convex's), set it consistently, and re-check both vendors' docs if auth fails with "no auth provider found matching the given token."

Convex picks this up automatically the next time `npx convex dev` pushes (no restart needed if it's already running — it syncs env var changes live).

### 4b. Create the Vercel project

1. Sign up / log in at [vercel.com](https://vercel.com), then **Add New → Project**, and import your GitHub fork. Vercel auto-detects the **Vite** framework preset correctly — confirmed against the real scaffold, no manual override needed there.
2. Override the **Build Command** (**Settings → Build and Deployment**, toggle "Override" on) to:
   ```
   npx convex deploy --cmd 'npm run build'
   ```
   This is the whole deploy mechanism — Convex's Vercel integration means there's no separate GitHub Actions deploy job. One command deploys your Convex functions *and* builds the static frontend together (see `docs/architecture/ci-cd-and-testing.md`).
3. Generate the deploy key **before** wiring env vars: in the Convex dashboard, switch the deployment selector to **production**, go to **Deployment Settings → General → Deploy Keys**, and create one. Convex's current key-creation UI asks you to pick specific permissions rather than issuing a full-access key — check only **`deployment:deploy`** under "Deployment" (that's the one permission `npx convex deploy` needs; leave data/env/logs/backups unchecked). Copy the key immediately, it's shown once.
4. **Set `CLERK_JWT_ISSUER_DOMAIN` on the production Convex deployment too — this is easy to miss.** Step 4a set it on your `dev` deployment; `dev` and `production` have entirely separate env vars, and this one bit us during validation (first prod deploy failed with the same "not set" error from Step 2, but for `production` this time). Run:
   ```
   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://verb-noun-00.clerk.accounts.dev --prod
   ```
5. Add environment variables, in Vercel's project **Settings → Environment Variables**:

   | Name | Value | Scope |
   |---|---|---|
   | `CONVEX_DEPLOY_KEY` | the deploy key from step 3 | Production |
   | `VITE_CONVEX_URL` | your Convex project's **production** deployment URL (`https://<your-project>.convex.cloud`, prod deployment — not the dev one) | Production (and Preview, if you want PR previews to work) |
   | `VITE_CLERK_PUBLISHABLE_KEY` | the Publishable key from Step 3.6 | Production (and Preview) |

   Confirmed working against the real scaffold with these exact `VITE_`-prefixed names. **After saving each one, it's worth double-checking the value actually stuck** — Vercel's env vars default to "sensitive" (write-only; not even the Vercel CLI can read the value back, so there's no way to verify from outside the dashboard) and it's easy for a value to silently not save on the first attempt. If the deployed app throws `Missing VITE_CLERK_PUBLISHABLE_KEY` (or the Convex URL equivalent) in the browser console despite the variable being listed, don't trust that it's "probably fine" — remove and re-add it.
6. **If your very first deploy fails** with a Convex auth error: that's very likely just a chicken-and-egg timing issue, not a real misconfiguration — Vercel may auto-trigger an initial build the moment you import the project, before you've had a chance to set `CONVEX_DEPLOY_KEY`. Once all the env vars above are in place (on both Vercel and, per step 4, the production Convex deployment), trigger a fresh deploy (push a commit, or **Deployments → ⋯ → Redeploy**) and it should go through.

## Step 5 — First deploy

1. Push a commit to your fork's `main` branch (even a trivial one, if you haven't changed anything) — this is what triggers Vercel's git integration.
2. Watch the deploy in the Vercel dashboard's **Deployments** tab. The build log should show `npx convex deploy` running first (pushing your schema and functions to the `prod` Convex deployment) followed by `npm run build`.
3. If the build fails on `npx convex deploy` with an auth error, double check `CONVEX_DEPLOY_KEY` is the **Production**-scoped key from the correct project. If it fails on the Clerk/JWT side once the app loads, re-check Step 4a (issuer domain value, JWT template name).

## Step 6 — Verify it works

1. Open your domain (from "What you'll need") — Vercel serves the app there once DNS resolves.
2. An unauthenticated visit lands you on `/public/events` (confirmed — this actually redirects and renders against a live deployment, not just on paper).
3. Go to `/sign-in` and sign in with Google or create a username/password account. This creates your `members` record on first login (`ensureCurrentMember`, called automatically once you land on `/`) — you'll see your dashboard at `/`, showing your choir's name and a welcome message with your name (only if you did Step 3's email/name claims — otherwise it'll say "New Member").

   **Sign in from a normal browser, not an automated/headless one.** Clerk's CAPTCHA can fail to load under browser automation (it detected during this guide's own validation) — not a real-app bug, just an artifact of testing tools.
4. **You'll land as a Chorister, not an Admin.** See Step 7 — this is expected and part of the intended bootstrap flow, not a bug.

If any of this fails, the most likely culprits, in order: Clerk JWT template not literally named `convex`; `CLERK_JWT_ISSUER_DOMAIN` value mismatched or using the wrong Clerk instance's Frontend API URL; `VITE_CONVEX_URL` pointing at your `dev` deployment instead of `prod`.

## Step 7 — Become an Admin

New Members default to Role `chorister` on first login (per the auth research, so nobody can self-assign elevated access) — but that leaves nobody able to reach Director/Admin-only views on a brand-new deployment. One-time bootstrap, implemented and validated: a Convex `internalMutation` (callable only via the CLI's deploy key, never from client code) that promotes one Member to Admin, and refuses to run if the `members` table already has an Admin — so it's safe to leave in the codebase rather than something to remember to delete.

```
npx convex run members:bootstrapFirstAdmin '{"email":"you@yourchoir.org"}' --prod
```

(Drop `--prod` while you're still testing locally against your `dev` deployment.)

---

## Step 8 — Email Bulletins to the choir (optional)

When a Director publishes a Bulletin, the app can email it to every Member. This step switches that on. Skip it for now if you like: without it, publishing still works and the manage page just says "Email is not configured for this deployment".

**You'll need**

- About 30 minutes.
- Access to your domain's DNS settings (wherever you bought `yourchoir.org`).
- The Convex dashboard open at your production deployment ([dashboard.convex.dev](https://dashboard.convex.dev)).
- A free [Resend](https://resend.com) account. Resend is the service that actually delivers the mail.

### The fast way: run the setup wizard

A script does everything below except the two things only you can do: create one Resend key, and paste DNS records at your registrar. Run it from the repo folder after the app has been deployed once:

```
npm run setup:email
```

It asks for your app's address, opens Resend for the key, registers your domain, prints the DNS records to add, waits while you add them, creates a send-only key for the app, registers the delivery webhook, and writes all four values into your production Convex deployment. It remembers where it got to, so if DNS takes a while you can stop and re-run later.

If you would rather do it by hand, or want to know what the script did, the rest of this step is the same procedure click by click.

### The manual way

Four values move from Resend and your domain into Convex. Collect them as you go:

| Value | You get it from | Looks like |
| --- | --- | --- |
| API key | Resend, Step 8a | `re_...` |
| From address | Your verified domain, Step 8a | `Sorrento Choir <bulletins@yourchoir.org>` |
| App URL | Wherever people open the app | `https://yourchoir.org` (no trailing slash) |
| Webhook secret | Resend, Step 8c | `whsec_...` |

### 8a. Prove to Resend that you own your domain

1. Sign up at [resend.com](https://resend.com) and sign in.
2. Left menu, **Domains**, then **Add Domain**. Enter the domain you will send from, for example `yourchoir.org`. Pick the region closest to you.
3. Resend now shows a list of DNS records to add. Keep this page open.
4. In a second tab, open your domain's DNS settings at your registrar (Cloudflare, Namecheap, GoDaddy, and so on).
5. For each record Resend lists, add a record of the same type with the same name and value. There are usually three or four: one or two for **DKIM**, one for **SPF**, and optionally one for **DMARC**. Copy them exactly from your Resend page. No guide can print them for you, because they are unique to your domain.
6. Back in Resend, click **Verify DNS Records**. Green ticks usually appear within a few minutes; occasionally it takes an hour or more. You can carry on with 8b while you wait.
7. Left menu, **API Keys**, then **Create API Key**. Name it `ChoirManagement`, permission **Sending access**, click **Add**. Copy the key that starts with `re_` now. Resend shows it only once.

### 8b. Give Convex the three sending values

These go into your **Convex** deployment, not Vercel and not a file in the repo, because the sending code runs inside Convex.

1. Open the Convex dashboard, choose your project, and make sure the **Production** deployment is selected at the top.
2. **Settings**, then **Environment Variables**, then **Add**.
3. Add these three, one at a time:

   | Name | Value |
   | --- | --- |
   | `RESEND_API_KEY` | the `re_...` key from 8a |
   | `BULLETINS_FROM_EMAIL` | `Your Choir <bulletins@yourchoir.org>`, on the domain you verified |
   | `APP_BASE_URL` | the address people open the app at, for example `https://choir-management-tawny.vercel.app` or `https://yourchoir.org`, with no `/` at the end |

4. Click **Save**.

All three must be present. If any one is missing, the app behaves as if this whole step was skipped. That is on purpose: a key with no From address cannot send, and a From address with no app URL would mail out a link that goes nowhere.

If you prefer the command line, the same thing from inside the repo folder is:

```
npx convex env set RESEND_API_KEY 're_your_key_here' --prod
npx convex env set BULLETINS_FROM_EMAIL 'Your Choir <bulletins@yourchoir.org>' --prod
npx convex env set APP_BASE_URL 'https://yourchoir.org' --prod
```

### 8c. Let Resend report back whether mail arrived

Without this, mail still goes out, but the app only learns of outright refusals. With it, the "Email delivery" panel on each published Bulletin fills in Delivered and Bounced on its own and names the Members whose mail failed.

1. Find your webhook address. In the Convex dashboard: **Settings**, then **URL & Deploy Key**, and copy the **HTTP Actions URL**. It ends in `.convex.site`. Add `/resend-webhook` to the end:

   ```
   https://your-deployment-name.convex.site/resend-webhook
   ```

2. In Resend: left menu, **Webhooks**, then **Add Webhook**.
3. Paste the address from step 1 as the endpoint URL.
4. Under events, tick every one that starts with `email.` (sent, delivered, delivery delayed, complained, bounced, failed). Click **Add**.
5. Resend now shows the webhook's **Signing Secret**, starting `whsec_`. Copy it.
6. Back in the Convex dashboard, **Settings**, **Environment Variables**, add `RESEND_WEBHOOK_SECRET` with that value, and **Save**.

Until the secret is set, the webhook address answers "503 not configured" and Resend's reports are ignored. Nothing breaks; you just do not get delivery details yet.

### 8d. Send one and watch it arrive

1. In the app, sign in as a Director or Admin, go to **Bulletins**, then **Manage**, and open a published Bulletin (or create and publish a test one).
2. Tick **Email this Bulletin to the roster** next to Publish, then publish.
3. The **Email delivery** panel appears under the Bulletin. Here is what each line means:

   | Panel says | Meaning |
   | --- | --- |
   | Handed to provider | The app gave the email to Resend. Nobody has received it yet. |
   | Delivered | Resend confirmed the receiving mail server accepted it. |
   | Bounced | The address rejected it. The Member's name is listed. |
   | Failed | Resend refused to send, with Resend's own reason shown. |

4. With the webhook set up, rows move to Delivered within a minute or two. Without it, the app asks Resend for an update about one minute after publishing and again fifteen minutes later.

A row still at "Handed to provider" after fifteen minutes means something is wrong. Check the table below.

### 8e. If it does not work

| What you see | Likely cause | Fix |
| --- | --- | --- |
| No email checkbox; page says "Email is not configured" | One of the three values in 8b is missing or on the wrong deployment | Confirm all three exist on the **Production** deployment in the Convex dashboard |
| Failed rows mentioning "domain" or "not verified" | DNS records not yet verified in Resend | Wait for the green ticks in Resend, then publish again |
| Failed rows mentioning "API key" or 401 | Wrong or revoked key | Create a new key in Resend and update `RESEND_API_KEY` |
| Failed rows mentioning the From address or 422 | `BULLETINS_FROM_EMAIL` is not on the verified domain or is malformed | Use `Name <address@yourchoir.org>` on the exact domain you verified |
| Everything stays at "Handed to provider" and Resend's dashboard shows them delivered | Webhook not registered or secret not set | Do 8c; check the webhook URL ends in `.convex.site/resend-webhook` |
| The link in the email opens the wrong site | `APP_BASE_URL` wrong | Set it to the address people actually use, no trailing slash |

Each Vercel preview deployment has its own Convex backend, so previews never send email unless you configure them separately. Leave previews unconfigured; the test suite assumes that.

### 8f. What Members see

- Every Member is emailed by default. A Member can opt out with **Email me published Bulletins** at the bottom of the Bulletins list. Opting out never hides a Bulletin from the archive.
- The Director chooses per publish. A Bulletin publishes once, so editing it later never re-sends. A substantive correction is a new Bulletin ([#49](https://github.com/hugoforte/ChoirManagement/issues/49)).
- If the Bulletin has a Share Link, the email links to that. Otherwise it links to the Bulletin inside the app.

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
- **New Members show up as "New Member" with no email** — you skipped the `email`/`name` claims in Step 3, or added them after members already signed up (existing tokens are cached; a fresh sign-in picks up the new claims).
- **`npx convex run` or `npx convex data` crash with `SyntaxError: Invalid flags supplied to RegExp constructor 'v'`** — you're on Node < 20. Check "What you'll need." (`npx convex dev` and `codegen` can still work on old Node in some cases, which makes this confusing — don't take that as a sign your Node version is fine.)
- **You ran `npx convex dev` and it created a project called `anonymous-<something>` instead of connecting to your real one** — see Step 2's `.env.local` warning; you lost the `CONVEX_DEPLOYMENT` link. Reconnect with `npx convex dev --configure existing --team <slug> --project <slug> --dev-deployment cloud`.

## Open questions / TODOs for the human

1. **The vertical slice covers `/`, `/sign-in`, `/public/events`, `/public/events/:eventId` only.** The rest of the route map (`docs/architecture/frontend-routes.md`) — Music Library, Members, Event management, Settings — isn't built yet. This guide's Step 6 verification only exercises what exists so far.
2. **First-admin bootstrap (Step 7) has been implemented** (`members:bootstrapFirstAdmin`, a guarded `internalMutation`) and validated by actually running it — no longer just a proposal.
3. **Bulk-import of the existing ~1000-song library (#8, deferred to v2) is out of scope here.** A freshly set-up instance starts with an empty Music Library; importing the existing library is a separate, not-yet-built tool.
4. **Whether `feat/scaffold-vertical-slice` has merged to `main` yet** determines whether "Step 1: fork the repo" actually gets you the files this guide references (`convex/auth.config.ts`, `package.json`, etc.) — check before following this guide verbatim against a fresh fork.
