# Convex + Clerk Integration Pattern: Auth and Role-Based Authorization

Purpose: answer [GitHub issue #3](https://github.com/hugoforte/ChoirManagement/issues/3) — this is **implementation-pattern research** (the exact mechanics of wiring Clerk into Convex, retrieving identity, mapping it to a Member record, and structuring role checks), **not** a re-decision of Clerk vs. Convex Auth vs. Auth0, which is already settled in `docs/adr/0002-clerk-for-auth.md` and out of scope here. All findings below are sourced live against docs.convex.dev and clerk.com (accessed 2026-09-10); each non-obvious claim is inline-cited. Where primary sources disagreed with each other or were silent, that is flagged explicitly rather than papered over.

---

## 1. The `auth.config.ts` shape Convex expects for a Clerk JWT issuer

Convex's own Clerk integration page gives this exact shape:

```ts
import { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
```
([docs.convex.dev/auth/clerk](https://docs.convex.dev/auth/clerk), accessed 2026-09-10)

- **`domain`**: Clerk's "Frontend API URL" for the application. In dev this looks like `https://verb-noun-00.clerk.accounts.dev`; in production, once a custom domain is configured, it looks like `https://clerk.<your-domain>.com` ([docs.convex.dev/auth/clerk](https://docs.convex.dev/auth/clerk), accessed 2026-09-10). Convex validates the JWT's `iss` claim against this value ([docs.convex.dev/auth/debug](https://docs.convex.dev/auth/debug), accessed 2026-09-10).
- **`applicationID`**: should be the literal string `"convex"`, matching the `aud` (audience) claim Convex expects on the token ([docs.convex.dev/auth/clerk](https://docs.convex.dev/auth/clerk); confirmed independently at [clerk.com/docs/guides/development/integrations/databases/convex](https://clerk.com/docs/guides/development/integrations/databases/convex), both accessed 2026-09-10).
- **Env var portability**: `docs.convex.dev/auth/clerk` consistently names the env var `CLERK_JWT_ISSUER_DOMAIN`, read via `process.env.CLERK_JWT_ISSUER_DOMAIN!` in `auth.config.ts` (accessed 2026-09-10, verified by re-fetching the page and asking for the literal string). You set this once per Convex deployment (dev and prod each get their own value, since each has its own Convex dashboard/env), so the same `auth.config.ts` source works unchanged across environments — only the deployment's env var value changes.

**Open discrepancy worth flagging:** the current Clerk-authored integration page (`clerk.com/docs/guides/development/integrations/databases/convex`) shows the *same* `auth.config.ts` shape but instructs setting the env var as `CLERK_FRONTEND_API_URL` via `npx convex env set CLERK_FRONTEND_API_URL <fapi_url>`, not `CLERK_JWT_ISSUER_DOMAIN` (accessed 2026-09-10). Both pages agree on the `auth.config.ts` *code shape* (`domain: process.env.<SOME_VAR>!, applicationID: "convex"`) and on `"convex"` as the audience — they disagree only on the recommended env var **name**. This looks like documentation drift between the two vendors' respective doc sets rather than two different mechanisms. Recommendation for implementation: treat the variable name as a local choice (pick one, e.g. `CLERK_JWT_ISSUER_DOMAIN`, and set it consistently via `npx convex env set` for each choir's deployment) and don't assume either doc page is stale-proof — re-check both pages at implementation time.

## 2. How a Convex query/mutation retrieves the authenticated identity

The API is still `ctx.auth.getUserIdentity()` — no newer/different API was found:

```ts
const identity = await ctx.auth.getUserIdentity();
```

It returns `null` if the request is unauthenticated, or the identity object if authenticated ([docs.convex.dev/auth/clerk](https://docs.convex.dev/auth/clerk), accessed 2026-09-10).

**Guaranteed fields** on the returned `UserIdentity` object: `tokenIdentifier` (a combination of `subject` and `issuer`, guaranteed unique across providers), `subject`, and `issuer` ([docs.convex.dev/auth/functions-auth](https://docs.convex.dev/auth/functions-auth), accessed 2026-09-10).

**Provider-dependent fields**, present when using Clerk (or Auth0): `familyName`, `givenName`, `nickname`, `pictureUrl`, `updatedAt`, `email`, `emailVerified`, and `name` ([docs.convex.dev/auth/functions-auth](https://docs.convex.dev/auth/functions-auth), accessed 2026-09-10). Example usage shown in the docs:

```ts
const identity = await ctx.auth.getUserIdentity();
const { tokenIdentifier, name, email } = identity!;
```
([docs.convex.dev/auth/functions-auth](https://docs.convex.dev/auth/functions-auth), accessed 2026-09-10)

**JWT template naming and custom claims:** Convex's Clerk setup flow is driven from the Clerk Dashboard's dedicated "Convex integration" screen (`dashboard.clerk.com/apps/setup/convex`), which "pre-populate[s] the default audience (`aud`) claim required by Convex" (accessed via search of `clerk.com/docs/integration/convex`, 2026-09-10) — i.e. the `aud: "convex"` mapping is provisioned for you rather than hand-typed. **Convex's own debugging page explicitly lists "failing to name the JWT template 'convex'" as a common Clerk-specific misconfiguration** ([docs.convex.dev/auth/debug](https://docs.convex.dev/auth/debug), accessed 2026-09-10) — so despite the newer Clerk databases-integration page not mentioning a template-naming step, the literal template name `convex` is still load-bearing in the current integration and should be verified by name in the Clerk Dashboard's JWT Templates screen when implementing.

Clerk's docs state you "can include additional claims as necessary" on this template (accessed via `clerk.com/docs/integration/convex` search summary, 2026-09-10), and Convex confirms: "custom claims you configure will be returned by `getUserIdentity()`" for Clerk users ([docs.convex.dev/auth/functions-auth](https://docs.convex.dev/auth/functions-auth), accessed 2026-09-10). Nested claim objects are flattened to dot-notation string keys, e.g. `identity["properties.role"]` ([docs.convex.dev/auth/functions-auth](https://docs.convex.dev/auth/functions-auth); [docs.convex.dev/auth/advanced/custom-jwt](https://docs.convex.dev/auth/advanced/custom-jwt), both accessed 2026-09-10). Certain JWT housekeeping claims are deliberately excluded from the identity object — e.g. Clerk's `fva` (factor verification age) is dropped "to avoid rerunning authenticated queries on every token refresh" ([docs.convex.dev/auth/clerk](https://docs.convex.dev/auth/clerk), accessed 2026-09-10).

**Is putting Role in a custom JWT claim the recommended pattern?** No page on `docs.convex.dev` or the Clerk docs fetched during this research explicitly recommends *or* discourages putting an authorization-relevant field like Role into a custom JWT claim — the docs describe the *mechanism* (custom claims flow through to `getUserIdentity()`) without taking a position on whether app-specific roles belong there versus in your own database table. This is noted as an **open question** rather than answered definitively; see the "Implications" section below for the practical recommendation given that gap, and section 5 for a concrete regression that makes JWT-claim-based roles riskier in practice.

## 3. Recommended pattern for mapping the Clerk identity to a Member record

Convex's official "Storing Users in the Convex Database" guidance describes **pattern (a): lookup-by-external-id with create-on-first-login**, done as a client-triggered mutation, as the documented baseline pattern — with webhook sync offered as a named alternative, not the default recommendation.

**Primary pattern — store-on-first-login:**

Schema:
```ts
users: defineTable({
  name: v.string(),
  tokenIdentifier: v.string(),
}).index("by_token", ["tokenIdentifier"]),
```

A `store` mutation checks whether the identity has already been stored, using `ctx.auth.getUserIdentity()`'s `tokenIdentifier`, and inserts a new row or patches the existing one if fields (e.g. `name`) changed ("Check if we've already stored this identity before") ([docs.convex.dev/auth/database-auth](https://docs.convex.dev/auth/database-auth), accessed 2026-09-10). Lookup for use in other functions:

```ts
const user = await ctx.db
  .query("users")
  .withIndex("by_token", (q) =>
    q.eq("tokenIdentifier", identity.tokenIdentifier)
  )
  .unique();
```
([docs.convex.dev/auth/database-auth](https://docs.convex.dev/auth/database-auth), accessed 2026-09-10)

On the client, a `useStoreUserEffect`-style React hook calls this mutation once `isAuthenticated` becomes true and holds the resulting `Id<"users">` in local state ([docs.convex.dev/auth/database-auth](https://docs.convex.dev/auth/database-auth), accessed 2026-09-10).

**Alternative — webhook-driven sync:** the same Convex page also documents a webhook-based approach: Clerk calls a Convex HTTP action on `user.created`/`user.updated`/`user.deleted`, which runs internal mutations named (in the example) `upsertFromClerk` and `deleteFromClerk`, keyed on `subject` (Clerk's own user id) rather than `tokenIdentifier` ([docs.convex.dev/auth/database-auth](https://docs.convex.dev/auth/database-auth), accessed 2026-09-10).

Clerk's own webhook docs frame webhook sync as the way to keep profile data (name/email changes, deletions) fresh without waiting for the user to take an in-app action, and specifically **recommend only syncing the fields you actually need** rather than mirroring the whole Clerk user object — "store *only* the extra user data in your own database" and read core identity fields from the session token/claims instead ([clerk.com/docs/webhooks/sync-data](https://clerk.com/docs/webhooks/sync-data), accessed 2026-09-10). Clerk's webhook events are delivered via Svix with at-least-once, potentially-out-of-order semantics and retries for up to 3 days, so handlers must **upsert on the Clerk user id** (idempotent) rather than assuming a strict create-then-update ordering; duplicate/replayed deliveries are expected and must be tolerated ([clerk.com/docs/webhooks/sync-data](https://clerk.com/docs/webhooks/sync-data); community write-up at [hookdeck.com/webhooks/platforms/guide-to-clerk-webhooks-features-and-best-practices](https://hookdeck.com/webhooks/platforms/guide-to-clerk-webhooks-features-and-best-practices), both accessed 2026-09-10). Verification differs by framework: Clerk's own Next.js snippet uses a built-in `verifyWebhook()` helper rather than hand-rolling Svix signature checks:

```ts
import { verifyWebhook } from '@clerk/nextjs/webhooks'
import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const evt = await verifyWebhook(req)
    const { id } = evt.data
    const eventType = evt.type
    return new Response('Webhook received', { status: 200 })
  } catch (err) {
    return new Response('Error verifying webhook', { status: 400 })
  }
}
```
([clerk.com/docs/webhooks/sync-data](https://clerk.com/docs/webhooks/sync-data), accessed 2026-09-10) — note this snippet is Next.js-specific (`@clerk/nextjs/webhooks`); ChoirManagement is a Vite+React SPA with a Convex HTTP action backend, so the equivalent handler would need Svix verification done directly (Clerk's generic/non-Next docs describe validating `svix-id`/`svix-timestamp`/`svix-signature` headers with an HMAC-SHA256 check against the endpoint's signing secret) rather than importing the Next.js-only helper — this is a gap to fill in with framework-agnostic Svix docs at implementation time, not something confirmed verbatim in the pages fetched here.

**Net:** Convex's documented default is lookup/create-on-first-login; webhook sync is Convex's and Clerk's documented pattern for keeping profile fields *fresh after* the initial login, not a replacement for the first-login creation step.

## 4. Where role-based authorization checks idiomatically belong

Convex's own docs (`docs.convex.dev/auth`) give the baseline guidance: "the most common way is to simply write code that checks if the user is logged in and if they are allowed to do the requested action at the beginning of each public function" — i.e., inline per-function checks are the documented starting point, not an anti-pattern ([docs.convex.dev/auth](https://docs.convex.dev/auth), accessed 2026-09-10).

Convex's Stack blog (the closest thing to official extended guidance beyond the reference docs) lays out a **three-tier progression**, explicitly recommending you start simple and add structure only as duplication emerges:

1. **Inline per-function checks** — "Having a few lines at the start of each endpoint that do endpoint-specific authorization can greatly simplify things," keeping authorization visible exactly where intent is clearest ([stack.convex.dev/authorization](https://stack.convex.dev/authorization), accessed 2026-09-10).
2. **Shared helper functions** for repeated checks, e.g.:
   ```ts
   async function ensureUserHasRoleOnTeam(
     ctx: QueryCtx, user: Doc<"users">, teamId: Id<"teams">, role: Role
   ) {
     const membership = await ensureUserIsOnTeam(ctx, teamId, user._id);
     const required = roles.indexOf(role);
     const actual = roles.indexOf(membership.role);
     if (required > actual) {
       throw new ConvexError({ kind: "authorization", error: `User is not a ${role}` });
     }
   }
   ```
   ([stack.convex.dev/authorization](https://stack.convex.dev/authorization), accessed 2026-09-10)
3. **A custom-function wrapper** (`customQuery`/`customMutation` from the `convex-helpers` package) to centralize the check for whole classes of endpoints, e.g. a parametrized `teamMutation` that takes a required `role` and throws before the handler runs:
   ```ts
   export const teamMutation = customMutation(mutation, {
     args: { teamId: v.id("teams") },
     input: async (ctx, args, opts: { role: Role }) => {
       const user = await ensureUserAuthenticated(ctx);
       await ensureUserHasRoleOnTeam(ctx, user, args.teamId, role);
       return { ctx: { db, user, teamId: args.teamId }, args: {} };
     },
   });

   export const suspendUser = teamMutation({
     role: "admin",
     args: { targetUserId: v.id("users") },
     handler: async (ctx, args) => { /* ... */ },
   });
   ```
   ([stack.convex.dev/authorization](https://stack.convex.dev/authorization), accessed 2026-09-10)

The `convex-helpers` package's own docs describe the general `customQuery`/`customMutation` mechanism the same way: it lets you "run authentication logic before requests start, look up commonly used data and add it to the ctx argument," with explicit, non-nested composition ("you can tell if your function is modified by whether it uses `mutation` or `apiMutation`") rather than implicit middleware chains ([github.com/get-convex/convex-helpers — customFunctions.ts / README](https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/README.md); worked example at [stack.convex.dev/custom-functions](https://stack.convex.dev/custom-functions), both accessed 2026-09-10). A minimal auth-injecting example from that page:
```js
const userQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    const user = await getUser(ctx);
    if (!user) throw new Error("Authentication required");
    return { user };
  })
);
```
([stack.convex.dev/custom-functions](https://stack.convex.dev/custom-functions), accessed 2026-09-10)

Convex's own explicit recommendation on *which tier to pick*: "I recommend co-locating authorization with user intent as much as possible, and adding additional layers as you go" — i.e. don't reach for the `customQuery`/`customMutation` wrapper on day one; start with inline checks or a shared helper and only add the wrapper once the same role check is duplicated across many functions ([stack.convex.dev/authorization](https://stack.convex.dev/authorization), accessed 2026-09-10).

## 5. Known Clerk + Convex gotchas

- **JWT template must be named `convex`, and this is a live source of breakage, not just setup trivia.** Convex's debug page names "failing to name the JWT template 'convex'" as a common Clerk misconfiguration ([docs.convex.dev/auth/debug](https://docs.convex.dev/auth/debug), accessed 2026-09-10). More seriously, a confirmed regression in `convex@1.34.0`'s `ConvexProviderWithClerk` caused it to send Clerk's **raw session token** instead of a token minted via the `"convex"` template whenever the session's own `aud` claim already equalled `"convex"` — the offending logic was `if (sessionClaims?.aud === "convex") { return await getToken({ skipCache: forceRefreshToken }); }`, which drops the `template: "convex"` parameter entirely. This silently strips custom claims (e.g. a `role` claim, `name`, `email`) from what `getUserIdentity()` sees server-side, breaking role-based checks without an obvious error. The reported workaround was pinning `convex` back to `1.32.0` ([github.com/get-convex/convex-js issue #145](https://github.com/get-convex/convex-js/issues/145), accessed 2026-09-10). **Implication:** pin/verify the `convex` package version when implementing, and add a test or manual check that a custom claim (if used) actually survives to `getUserIdentity()` after any `convex`/`@clerk/*` upgrade.
- **Dev vs. prod issuer domain differs by shape, not just value**, and must be re-pointed via env var per environment: dev uses Clerk's shared `*.clerk.accounts.dev` subdomain (e.g. `https://verb-noun-00.clerk.accounts.dev`); production uses a custom domain under the app's own domain (e.g. `https://clerk.<your-domain>.com`), which typically requires configuring a custom domain in the Clerk Dashboard first ([docs.convex.dev/auth/clerk](https://docs.convex.dev/auth/clerk), accessed 2026-09-10). Since ChoirManagement is one Convex Cloud project + one Clerk application **per Choir** (per ADR-0002/ADR-0001), each choir's deployment needs its own env var value set via `npx convex env set` — this is a per-deployment config step every time a new choir is onboarded, not a one-time global setting.
- **`applicationID`/`domain` mismatches are the most commonly reported failure mode.** The `applicationID` must exactly equal the JWT's `aud` claim, and `domain` must exactly equal the JWT's `iss` claim; mismatches produce a "no auth provider found matching the given token" failure, diagnosable by decoding the JWT (e.g. via jwt.io) and comparing `aud`/`iss` against `auth.config.ts` ([docs.convex.dev/auth/debug](https://docs.convex.dev/auth/debug), accessed 2026-09-10). Forgetting to run `npx convex dev`/`npx convex deploy` after adding or editing `auth.config.ts` is a related, commonly-hit gotcha — the dashboard will show "This deployment has no configured authentication providers" until you do ([docs.convex.dev/auth/debug](https://docs.convex.dev/auth/debug); [docs.convex.dev/auth/clerk](https://docs.convex.dev/auth/clerk), both accessed 2026-09-10).
- **Env var naming is itself unsettled between the two vendors' current docs** — see the discrepancy noted in section 1 (`CLERK_JWT_ISSUER_DOMAIN` per Convex's docs vs. `CLERK_FRONTEND_API_URL` per Clerk's current Convex integration page). Whichever name is picked, it must match what `auth.config.ts` reads via `process.env.<NAME>`.
- **Frontend hook choice matters:** use `useConvexAuth()` (from `convex/react`), not Clerk's own `useAuth()`, when a component needs to know whether the *Convex backend* has validated the token — Clerk's `useAuth()` only reflects Clerk-side session state and can be true before Convex has finished validating ([docs.convex.dev/auth/clerk](https://docs.convex.dev/auth/clerk), accessed 2026-09-10). Similarly, `ConvexProviderWithClerk` is documented as handling token refetching automatically ("`ConvexProviderWithClerk` takes care of refetching the token when needed") ([docs.convex.dev/auth/clerk](https://docs.convex.dev/auth/clerk), accessed 2026-09-10) — but see the `#145` regression above for a case where that refetch path silently dropped the template.
- **Token freshness / staleness of `getUserIdentity()`: not documented in the pages checked.** No fetched page (`docs.convex.dev/auth/clerk`, `/auth/functions-auth`, `/auth/debug`, `/auth/advanced/custom-jwt`) states a concrete re-validation interval or explicitly confirms/denies whether `getUserIdentity()` can return a stale (e.g. pre-role-change) claim mid-session. What is confirmed: JWTs are short-lived ("valid for a limited period of time like an hour") and carry an `iat` claim "expected by Convex clients to implement token refreshing" ([docs.convex.dev/auth/advanced/custom-jwt](https://docs.convex.dev/auth/advanced/custom-jwt), accessed 2026-09-10), implying identity claims refresh on that token-lifetime cadence (roughly hourly) rather than per-request — but this is an inference, not a directly stated guarantee, and is flagged here as an **open question** to verify empirically before relying on "role changes take effect within N minutes" as a product promise. This matters directly for ChoirManagement: if Role is ever carried as a JWT custom claim rather than read live from the `members` table, an Admin demoting a Director might not take effect until that Director's token naturally refreshes — one more reason (beyond the `#145` regression) to prefer reading Role from the database on each check rather than trusting a JWT claim, discussed further below.
- **Testing:** Convex provides an official test harness, `convex-test`, with a documented `t.withIdentity()` helper specifically for exercising authenticated functions in unit tests — if identity fields aren't specified, `issuer`, `subject`, and `tokenIdentifier` are auto-generated:
  ```ts
  test("authenticated functions", async () => {
    const t = convexTest(schema, modules);
    const asSarah = t.withIdentity({ name: "Sarah" });
    await asSarah.mutation(api.tasks.create, { text: "Add tests" });
    const sarahsTasks = await asSarah.query(api.tasks.list);
    expect(sarahsTasks).toMatchObject([{ text: "Add tests" }]);

    const asLee = t.withIdentity({ name: "Lee" });
    const leesTasks = await asLee.query(api.tasks.list);
    expect(leesTasks).toEqual([]);
  });
  ```
  ([docs.convex.dev/testing/convex-test](https://docs.convex.dev/testing/convex-test), accessed 2026-09-10). `t.withIdentity({...})` accepts arbitrary identity fields, so a `role` custom claim (if you choose to model Role that way) can be injected directly in tests without a real Clerk token. One known rough edge: `convex-test` can throw `"convexTest does not support async syscall: 1.0/getUserIdentity"` in some configurations involving triggers/`convex-helpers` (accessed via search of `github.com/get-convex/convex-test` issues, 2026-09-10) — worth a quick smoke test early rather than discovering it after a test suite is built out.

---

## Implications for ChoirManagement

A repo scan at research time confirmed **no `convex/` directory exists yet** — the only Convex-related file in the repo is `docs/adr/0001-self-hosted-per-choir-convex-cloud.md` (the deployment-topology ADR); there is no `schema.ts`, `auth.config.ts`, or any Convex functions to date. This is a greenfield implementation. The suggested paths below are therefore proposals, not references to existing code:

- **`convex/auth.config.ts`** — use the shape from section 1, reading the issuer domain from an env var (pick and document one name — e.g. `CLERK_JWT_ISSUER_DOMAIN` — set per-deployment via `npx convex env set`, since each Choir has its own Convex Cloud project and its own Clerk application per ADR-0001/ADR-0002). Confirm at implementation time whether Convex's or Clerk's current docs' env-var name has converged (section 1's discrepancy may be resolved by the time this is built).
- **Clerk Dashboard setup, per Choir**: activate the Convex integration (`dashboard.clerk.com/apps/setup/convex`) on that Choir's Clerk application, and explicitly verify the resulting JWT template is named exactly `convex` (per the debug-page gotcha in section 5) rather than assuming the dashboard flow guarantees it silently.
- **Member creation on first login**: follow the store-on-first-login pattern from section 3, adapted to this repo's vocabulary — a `members` table (not `users`), looked up by `identity.subject` (Clerk's stable per-user id) or `identity.tokenIdentifier`, with a `create-if-missing` mutation invoked from the client once Clerk reports an authenticated session. New Members should default to Role **Chorister** (the base Role per `CONTEXT.md`) rather than any elevated Role, so that Admin/Director access is always a deliberate promotion by an existing Admin, not something a new signup can self-assign. Suggested location: `convex/members.ts` for the table's queries/mutations, alongside `convex/schema.ts` for the table definition.
- **Role storage: prefer the `members` table over a JWT custom claim**, given two findings above — (a) no Convex or Clerk doc explicitly endorses JWT claims as the recommended way to carry authorization-relevant fields (section 2), and (b) a confirmed regression (`#145`) and an unconfirmed staleness window (section 5) both mean a JWT-carried Role can silently fail to reflect the current Role. Read Role live from the `members` row on each authorization check instead of trusting `identity`'s custom claims, even though Clerk technically supports adding a `role` claim to the `convex` JWT template.
- **A shared `requireRole` helper, not (yet) a `customQuery`/`customMutation` wrapper.** Given Convex's own "start simple, add layers as you go" guidance (section 4) and that this is a small, single-maintainer OSS app, the right starting point is a helper in something like **`convex/lib/auth.ts`** (a `lib/` subfolder under `convex/` is a common convention for non-function helper code, though this repo has no existing `convex/` layout to match yet — pick this path when scaffolding) with a shape like:
  ```ts
  export async function requireMember(ctx: QueryCtx | MutationCtx) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");
    const member = await ctx.db
      .query("members")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!member) throw new ConvexError("No Member record for this identity");
    return member;
  }

  export async function requireRole(ctx: QueryCtx | MutationCtx, role: "Admin" | "Director") {
    const member = await requireMember(ctx);
    const order = ["Chorister", "Director", "Admin"];
    if (order.indexOf(member.role) < order.indexOf(role)) {
      throw new ConvexError(`Requires ${role} role`);
    }
    return member;
  }
  ```
  called at the top of Admin-gated mutations (per `CONTEXT.md`: managing Members/Roles/Choir settings) and Director-gated mutations (managing the Music Library, roster, Events). This is illustrative, not a verified docs quote — it follows the pattern shown in section 4 but adapted to this repo's three-tier Role rather than copied from any single source. If/when many functions need the same Role gate, revisit the `convex-helpers` `customMutation` wrapper pattern from section 4 rather than starting there.
- **Webhook sync: treat as a later enhancement, not required for a first cut.** Since Member records are created lazily on first login already, a Clerk `user.updated` webhook (to keep `name`/`email` in sync if a Member edits their profile in Clerk directly) is a nice-to-have, not a blocker — especially since this app's own `members` table is likely to be the place Directors edit roster info, making Clerk-side edits a secondary path. If added later, it needs its own Convex HTTP action route and Svix signature verification (framework-agnostic, since this is a Vite SPA, not Next.js — section 3's caveat about the Next.js-only `verifyWebhook()` helper applies).
- **Testing**: use `convex-test`'s `t.withIdentity({...})` (section 5) to write unit tests for `requireRole`/`requireMember` and for each Role-gated mutation, covering both the "correct Role" and "insufficient Role" cases without needing a real Clerk token.
