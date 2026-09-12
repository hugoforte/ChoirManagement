import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Seeding for non-production deployments (the `staging` deployment behind
// Vercel Preview builds today; a per-branch preview deployment later). Two
// separate concerns:
//
//   demo              — content, so a reviewer opening a preview URL sees a
//                       populated app instead of empty lists.
//   upsertRoleMember  — one app Member per Role, pre-linked to a Clerk test
//                       user, so authenticated E2E and manual review need no
//                       "promote me" step against a fresh database.
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

export const demo = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    requireSeedableDeployment();

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
      title: "Tuesday Rehearsal",
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
      return null;
    }

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
    return null;
  },
});
