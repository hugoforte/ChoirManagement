# Orchestration brief: Bulletins (#49) and Polls (#9)

Written for a model coordinating sub-agents across these two epics. Everything here is derived from the grilling session that produced the two epic bodies, `CONTEXT.md`'s new terms, ADR-0004, and ADR-0005 — read those first; this file only covers *how to run the work*, not what to build.

## The shape

Two epics, deliberately designed to run as **parallel workstreams**, joined by a single shared foundations slice.

```
                    #79 Foundations
                    (schema, capabilities, nav shells)
                          │
            ┌─────────────┴─────────────┐
            ▼                           ▼
    #80 Bulletin authoring       #84 Poll authoring
            │                           │
   ┌────────┼────────┐                  ▼
   ▼        ▼        ▼          #85 Responding grid
 #81      #82      #83                  │
Remarks  Archive  Share Links   ┌───────┼───────┐
                    │           ▼       ▼       ▼
                    ▼         #86     #87     #88
                  #52       Editing  Close/  List &
                  Email               promote history
```

## Why foundations is its own PR

`#79` exists for one reason: **both epics need `convex/schema.ts` and `convex/lib/capabilities.ts`.** Without it, the first two parallel agents collide in exactly those two files on day one — the single most predictable failure mode of this setup. Land `#79` alone, on `main`, before starting anything else. It is deliberately thin: no queries, no mutations, no UI beyond placeholders.

Do not let an agent "just add the table it needs" inside a feature PR. That defeats the entire point of the slice.

## Parallelism

- **Nothing runs before `#79` merges.** One agent, one PR.
- After `#79`: **two agents in parallel**, one per epic. After foundations the epics touch disjoint files — `convex/bulletins.ts` + Bulletin routes versus `convex/polls.ts` + Poll routes.
- Within the Bulletins epic, after `#80` merges, `#81` / `#82` / `#83` are genuinely independent of one another and can run **three-wide** if you want the throughput. They touch different routes and different query surfaces. `#81` is the only one that touches `src/routes/PieceDetail.tsx`.
- Within the Polls epic the chain is essentially linear: `#84 → #85 → {#86, #87, #88}`. The last three can run three-wide once `#85` merges, but `#88` reuses `#85`'s grid component, so if you run them concurrently, `#88`'s agent must treat that component as read-only.
- `#52` is last and is **not agent-completable** — see below.

## Branching

- Default to **independent feature branches off `main`**, one per child issue, merged as they go. The dependency edges above are already recorded as GitHub `blocked_by` relationships, so a child is ready exactly when its blockers are closed.
- Use `gh stack` **only** when you deliberately start a dependent child before its blocker has merged — that is the case it exists for. Per AGENTS.md, do not force independent PRs into a stack just because they shipped together; check real file overlap first.
- `main` is branch-protected: PRs required, `check` and `e2e-guest` green before merge. Direct pushes are blocked, not merely discouraged.

## Verification gate per child

Every child PR must clear all of these before it is considered done:

1. `npm run check` — tsc across convex + app, plus the vite build.
2. `npm test` — vitest across `convex/**/*.test.ts` and `src/**/*.test.{ts,tsx}`.
3. The narrowest relevant Playwright project (`chromium-director`, `chromium-admin`, or `chromium-guest`).
4. CI green on the PR: the `check` and `e2e-guest` workflows.
5. **Hand-off to the repo owner** per AGENTS.md's Feature Delivery Workflow step 6: the PR waits, with its preview URL and the seeded Role to sign in as, until the owner has done the manual preview verification and named the PR to merge. The orchestrator's own preview check is a smoke test, not the gate. Merging deploys to production.

Step 5 is why seeding matters more than usual here. `#82` seeds a demo Bulletin and `#88` seeds an open Poll; until those land, later previews have nothing to look at.

## Standing constraints every agent must honour

These are the ones this design is most likely to trip over:

- **`convex/public.ts` must never query `rsvps` or `members`.** The public/private boundary is enforced by which functions exist where, not by a conditional. `#83` adds the app's only unauthenticated read of Member-only content and has to stay inside this rule.
- **No Poll data is ever public.** No token sharing of Polls, no public route, no exception. The grid is named personal data.
- **Availability never becomes an RSVP.** `#87` is where this would silently get "helpfully" added. It must not be.
- **Never read the wall clock inside a query** — pass `now` in as an argument.
- **Every Convex function needs `args` and `returns` validators.** Throw on failure; do not return discriminated unions.
- **Gate `requireMember`-backed queries behind `members.viewer` resolving to a real Member**, not merely `isSignedIn`. This race caused a real white-screen crash once.
- **Ship tests with user-visible behaviour changes.** Not optional; see AGENTS.md.
- Before adding any dependency (a Markdown renderer in `#80`, a mail client in `#52`), check AGENTS.md's dependency guidelines.

## The human-gated slice

`#52` (email) needs **repository-owner DNS access** to verify a sender domain. An agent cannot finish it. Run it last, and have the agent stop at the point where it needs DNS records and say exactly which records are needed rather than guessing. This is precisely why email was split out of `#49` instead of being built into the publish path: nothing else in the epic should be blocked behind a manual DNS step.

## Do not re-litigate

These were settled deliberately and an agent proposing "an improvement" here is regressing the design:

- Event gets **no** `kind`/`type` field (#9).
- Bulletins get **no** `Public`/`Private` Visibility — that concept stays specific to Events (ADR-0004).
- Polls are **not** modelled as proposed Events (ADR-0005).
- No notification table, feed, or read receipts — the unread marker is one timestamp (#57 owns the rest).
- No file attachments on Bulletins in v1.
- `manageBulletins` and `managePolls` stay separate from `manageEvents` even though all three currently resolve to the same Roles.
- No `chromium-chorister` Playwright project. AGENTS.md notes its absence is deliberate; do not let it ride along on this work.
