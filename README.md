# ChoirManagement

> Live demo: [choir-management-tawny.vercel.app](https://choir-management-tawny.vercel.app/)

An open-source, self-hosted web app for choirs to manage their music library, member roster, and event scheduling — built on [Convex](https://convex.dev), [Clerk](https://clerk.com), and [Vercel](https://vercel.com).

Each choir runs its own instance: your own Convex project, your own Clerk app, your own Vercel deployment. No shared backend, no vendor lock-in beyond the free tiers those services already offer. See [`CONTEXT.md`](./CONTEXT.md) for the domain vocabulary and [`docs/adr/`](./docs/adr/) for why the stack looks the way it does.

## What it does (v1)

- **Music Library** — Pieces with sheet music/other files and a YouTube reference link.
- **Member roster** — Admin / Director / Chorister roles.
- **Event scheduling** — one-off Events, Yes/No/Maybe RSVPs, a Setlist of Pieces per Event.
- **A public, read-only Events page** — a Director can opt an Event into public visibility (metadata + Setlist titles only — never files, RSVPs, or the roster).

## Status

The v1 product slice is implemented and validated end-to-end against a real Convex + Clerk + Vercel deployment. It includes sign-in, the Member dashboard, Music Library, Member roster and role management, Event scheduling with RSVPs and Setlists, Admin Settings, public Events, and a responsive light/dark app shell. The next planned product feature is an availability survey for checking choir availability across proposed concert dates ([issue #9](https://github.com/hugoforte/ChoirManagement/issues/9)). See [`docs/architecture/frontend-routes.md`](./docs/architecture/frontend-routes.md) for the route map.

## Get started

Follow [`docs/guides/self-hosting.md`](./docs/guides/self-hosting.md) — a step-by-step walkthrough, corrected against a real first-time setup rather than written speculatively. It'll have you fork the repo, create a Convex project and a Clerk app, connect Vercel, and deploy.

## Stack

Convex (database + backend functions + auth wiring), Clerk (Google OAuth + password login), React + Vite + Tailwind (frontend), Vercel (hosting, deployed via its native Convex build-command integration — no separate deploy pipeline). See [`docs/architecture/ci-cd-and-testing.md`](./docs/architecture/ci-cd-and-testing.md) for the CI/CD design and [`docs/adr/`](./docs/adr/) for the reasoning behind each choice.

## Vision

### The ideal setup experience

Today, standing up an instance means following the self-hosting guide by hand — creating accounts, generating keys, wiring environment variables. The goal: **clone the repo, log into Vercel/Clerk/Convex once each, and have an agent handle everything else** — project creation, JWT/env-var wiring across both Convex and Vercel, first deploy, verification — the way a human operator did it manually while building this project.

The one-time login per service is the irreducible human step (OAuth-gated signups can't be scripted around), not a limitation to design away. Everything past that point has already been shown to be fully driveable by an agent with CLI access — this project's own setup was done exactly that way, surfacing and fixing real bugs along the way (an SPA routing gap, silently-unsaved environment variables, a Convex env var that needs setting separately per deployment, among others) that a from-scratch automation attempt would otherwise have had to rediscover.

This isn't built yet, deliberately: the self-hosting guide needs to stay solid and hand-verified first — automating a path before it's fully debugged just automates whatever bugs are still hiding in it. Once it's held up across a few more real setups, the next step is turning it into an actual script or agent skill.

### Product direction

The deeper product vision — full score-reading parity with apps like Newzik (splitting Pieces into per-voice Parts, per-part audio mixing, in-app annotation, native MuseScore import, live score-follow) and bulk-import tooling for migrating an existing music library — is deliberately out of scope for v1. See the "Out of scope" section of the [v1 architecture spec map](https://github.com/hugoforte/ChoirManagement/issues/1) for the detail; not restated here to avoid two copies of the roadmap drifting apart.

## License

[AGPL-3.0](./LICENSE).
