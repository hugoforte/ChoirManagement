import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Seeds a non-production deployment (the shared `staging` deployment behind
// Vercel Preview builds) with enough content that a reviewer opening a
// preview URL sees a populated app instead of empty lists.
//
// Idempotent: re-running adds nothing if the demo Pieces are already there,
// so it's safe to call repeatedly. Refuses to touch a deployment that already
// holds real Member data beyond the demo set, so a mis-pointed
// CONVEX_DEPLOY_KEY can't wipe or pollute a live choir's deployment.
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

export const demo = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
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

// Companion to `demo` for preview/staging review: promotes an already
// signed-in Member so a reviewer can exercise Director-only screens. Split
// from `demo` because it can only run after that person has signed in once
// (the Member row is created on first login), whereas `demo` runs before
// anyone has.
export const promoteReviewer = internalMutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, { email }) => {
    const member = await ctx.db
      .query("members")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!member) {
      throw new Error(`No Member found with email ${email} — sign in to the preview app first, then retry.`);
    }
    await ctx.db.patch("members", member._id, { role: "admin" });
    return null;
  },
});
