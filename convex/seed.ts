import { v } from "convex/values";

import { internalMutation, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { DEFAULT_VOICE_PARTS } from "./lib/pieceAttachmentPolicy";

// Seeding for non-production deployments (the `staging` deployment behind
// Vercel Preview builds today; a per-branch preview deployment later). Three
// separate concerns:
//
//   demo              — content, so a reviewer opening a preview URL sees a
//                       populated app instead of empty lists.
//   upsertRoleMember  — one app Member per Role, pre-linked to a Clerk test
//                       user, so authenticated E2E and manual review need no
//                       "promote me" step against a fresh database.
//   demoBulletin      — content again, but it needs an author, so it runs
//                       after the roster rather than inside demo.
//
// Why pre-seeding a Member works without touching the auth path at all:
// `members.ensureCurrentMember` looks the caller up by `clerkUserId` and, when
// it finds an existing row, patches only name/email — never role. So a row
// seeded here with role "director" survives that user's first sign-in.

const DEMO_PIECES = [
  {
    title: "Sicut Cervus",
    composer: "Giovanni Pierluigi da Palestrina",
    notes: "SATB a cappella. Watch the entries in bar 12.",
  },
  {
    title: "The Blue Bird",
    composer: "Charles Villiers Stanford",
    arranger: "arr. for SSAATTBB",
    notes: "Soprano solo floats above a very quiet chord.",
  },
  {
    title: "Bogoroditse Devo",
    composer: "Sergei Rachmaninoff",
    notes: "From the All-Night Vigil, Op. 37.",
  },
];

// Bounds the two lookups demoBulletin does over tables the demo seed itself
// fills, rather than an unbounded .collect() on a table a real choir grows.
const SEED_SCAN_LIMIT = 200;

const DEMO_REHEARSAL_TITLE = "Tuesday Rehearsal";

// Markdown, not plain prose: the reading view renders the body through
// src/design/Markdown.tsx, and a preview with nothing but a paragraph in it
// wouldn't show whether that rendering works.
const DEMO_BULLETIN = {
  title: "After Tuesday's rehearsal",
  body: `Good work tonight — the Palestrina is finally sitting.

## What we covered

- **Sicut Cervus** — the entries in bar 12, slowly. Count the rest.
- **The Blue Bird** — the soprano solo floats; everyone else is accompaniment.

## Before next week

1. Look at *Bogoroditse Devo* from the top.
2. Call time for the Spring Concert is **18:30**.
`,
};

// Demo content must never land in a real choir's deployment, and a Convex
// function can't tell which deployment it's running on — so this is gated on
// an env var that is set only on deployments meant to hold throwaway data.
function requireSeedableDeployment() {
  if (process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error(
      "Refusing to seed: ALLOW_DEMO_SEED is not \"true\" on this deployment. " +
        "Set it only on staging/preview deployments, never production.",
    );
  }
}

async function ensureDefaultVoicePartsInContext(ctx: MutationCtx) {
  for (const part of DEFAULT_VOICE_PARTS) {
    const existing = await ctx.db
      .query("voiceParts")
      .withIndex("by_default_key", (q) => q.eq("defaultKey", part.defaultKey))
      .unique();
    if (existing) continue;

    await ctx.db.insert("voiceParts", {
      ...part,
      status: "active",
      updatedAt: Date.now(),
    });
  }
}

// Safe for preview setup and an eventual production bootstrap/migration:
// inserts only missing built-in parts and never resets choir customization.
export const ensureDefaultVoiceParts = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ensureDefaultVoicePartsInContext(ctx);
    return null;
  },
});

export const demo = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    requireSeedableDeployment();
    await ensureDefaultVoicePartsInContext(ctx);

    const existingPieces = await ctx.db.query("pieces").take(1);
    if (existingPieces.length > 0) {
      return null;
    }

    const settings = await ctx.db.query("choirSettings").first();
    if (!settings) {
      await ctx.db.insert("choirSettings", {
        name: "Demo Choir (staging)",
        description: "Seeded data for preview deployments — not a real choir.",
      });
    }

    const pieceIds: Id<"pieces">[] = [];
    for (const piece of DEMO_PIECES) {
      pieceIds.push(await ctx.db.insert("pieces", { ...piece, files: [] }));
    }

    const day = 24 * 60 * 60 * 1000;
    // Relative to seed time rather than a fixed date, so a long-lived
    // staging deployment never drifts into having only past Events (which
    // would make the upcoming-Events lists look broken).
    const now = Date.now();
    await ctx.db.insert("events", {
      title: DEMO_REHEARSAL_TITLE,
      description: "Full choir. Bring your Palestrina.",
      startsAt: now + 3 * day,
      location: "St. Mary's Hall",
      setlist: [pieceIds[0], pieceIds[1]],
      visibility: "private",
    });
    await ctx.db.insert("events", {
      title: "Spring Concert",
      description: "Open to the public. Call time 18:30.",
      startsAt: now + 21 * day,
      location: "Town Cathedral",
      setlist: pieceIds,
      visibility: "public",
    });

    return null;
  },
});

// A Bulletin is authored *by* a Member, so this can't live inside `demo`:
// there is no roster at that point. `preview` runs it after the Role Members
// are in place, and a deployment seeded without them gets no demo Bulletin
// rather than one attributed to a fabricated author.
export const demoBulletin = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    requireSeedableDeployment();

    const existing = await ctx.db.query("bulletins").take(1);
    if (existing.length > 0) {
      return null;
    }

    // Scanning the roster rather than indexing by role, for bootstrapFirstAdmin's
    // reason: a seeded roster is three rows, and the index would exist for this
    // alone. A Chorister can't hold manageBulletins, so authoring the demo
    // Bulletin as one would seed a state the app itself can't produce.
    const members = await ctx.db.query("members").take(SEED_SCAN_LIMIT);
    const author =
      members.find((m) => m.role === "director") ?? members.find((m) => m.role === "admin");
    if (!author) {
      console.warn("No Director or Admin Member to author the demo Bulletin — skipping.");
      return null;
    }

    const events = await ctx.db.query("events").take(SEED_SCAN_LIMIT);
    const rehearsal = events.find((e) => e.title === DEMO_REHEARSAL_TITLE);

    // Published, not a draft: the point is that a reviewer opening /bulletins
    // as any Role sees something, and drafts are invisible there.
    const now = Date.now();
    await ctx.db.insert("bulletins", {
      ...DEMO_BULLETIN,
      eventId: rehearsal?._id,
      status: "published",
      publishedAt: now,
      updatedAt: now,
      createdByMemberId: author._id,
      updatedByMemberId: undefined,
      shareLink: undefined,
    });
    return null;
  },
});

// Idempotent by clerkUserId, so re-running against an already-seeded
// deployment corrects drift rather than creating duplicate Members.
// `clerkUserId` must be the full Clerk token identifier
// (`<issuer>|<clerk_user_id>`), which is what ensureCurrentMember matches on —
// `scripts/e2e/seed-role-members.mjs` assembles it from the Clerk Backend API.
export const upsertRoleMember = internalMutation({
  args: {
    clerkUserId: v.string(),
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("director"), v.literal("chorister")),
  },
  returns: v.id("members"),
  handler: async (ctx, { clerkUserId, name, email, role }) => {
    requireSeedableDeployment();

    if (!clerkUserId.includes("|")) {
      throw new Error(
        `clerkUserId must be a full Clerk token identifier like "<issuer>|user_123", got: ${clerkUserId}`,
      );
    }

    const existing = await ctx.db
      .query("members")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();
    if (existing) {
      await ctx.db.patch("members", existing._id, { name, email, role });
      return existing._id;
    }

    return await ctx.db.insert("members", { clerkUserId, name, email, role });
  },
});

// Entry point for `npx convex deploy --preview-run seed:preview`, which Convex
// runs once against each newly provisioned preview deployment. Does both jobs
// so a fresh per-branch backend is immediately reviewable and testable:
// demo content, plus one Member per Role.
//
// The Role Members come from the SEED_ROLE_MEMBERS env var (a JSON array) —
// set as a project-level default for *preview* deployments, so every new
// preview inherits it without a per-deployment setup step. It holds Clerk
// token identifiers rather than doing a Clerk lookup, because a Convex
// mutation can't call Clerk's Backend API; `scripts/e2e/seed-role-members.mjs`
// resolves the ids and keeps this default in sync.
//
// Note Convex does NOT fail the deploy if --preview-run throws, so a broken
// seed shows up as an empty preview rather than a red build.
export const preview = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    await ctx.runMutation(internal.seed.demo, {});

    const raw = process.env.SEED_ROLE_MEMBERS;
    if (!raw) {
      console.warn("SEED_ROLE_MEMBERS is not set — skipping Role Member seeding.");
    } else {
      let entries: unknown;
      try {
        entries = JSON.parse(raw);
      } catch (error) {
        throw new Error(`SEED_ROLE_MEMBERS is not valid JSON: ${String(error)}`);
      }
      if (!Array.isArray(entries)) {
        throw new Error("SEED_ROLE_MEMBERS must be a JSON array.");
      }

      for (const entry of entries as Array<Record<string, string>>) {
        await ctx.runMutation(internal.seed.upsertRoleMember, {
          clerkUserId: entry.clerkUserId,
          name: entry.name,
          email: entry.email,
          role: entry.role as "admin" | "director" | "chorister",
        });
      }
    }

    // Last, because it needs an author from the roster above.
    await ctx.runMutation(internal.seed.demoBulletin, {});
    return null;
  },
});
