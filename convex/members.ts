import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentMember, requireMember, requireRole } from "./lib/auth";
import schema from "./schema";

const rosterEntry = v.object({
  _id: v.id("members"),
  name: v.string(),
  role: schema.tables.members.validator.fields.role,
});

// Member-only, and deliberately name+role only — every Member can call
// this (it backs the /members roster page, not just /members/manage), so
// email/clerkUserId stay off it regardless of what the frontend route
// itself gates (see docs/architecture/frontend-routes.md's open question
// on roster field exposure).
export const list = query({
  args: {},
  returns: v.array(rosterEntry),
  handler: async (ctx) => {
    await requireMember(ctx);
    const members = await ctx.db.query("members").collect();
    return members.map((m) => ({ _id: m._id, name: m.name, role: m.role }));
  },
});

// Admin-only per CONTEXT.md ("Admin: can manage Members, Roles") — see
// /members/manage's frontend gating in src/routes/MembersManage.tsx.
export const updateRole = mutation({
  args: {
    memberId: v.id("members"),
    role: schema.tables.members.validator.fields.role,
  },
  returns: v.null(),
  handler: async (ctx, { memberId, role }) => {
    await requireRole(ctx, ["admin"]);
    await ctx.db.patch("members", memberId, { role });
    return null;
  },
});

// Returns the current signed-in Member's record, or null if signed out or
// if this is their first sign-in and ensureCurrentMember hasn't run yet.
export const viewer = query({
  args: {},
  returns: v.union(v.null(), schema.doc("members")),
  handler: async (ctx) => {
    return await getCurrentMember(ctx);
  },
});

// Create-on-first-login, sync-on-every-login (see
// docs/research/convex-clerk-integration-pattern.md). The frontend calls
// this once after sign-in. New Members always start as "chorister" —
// nobody can self-assign elevated access (see Step 7 of
// docs/guides/self-hosting.md for how the very first Admin gets promoted).
// Role is never touched here on an existing Member, only name/email — this
// exists so a profile change on Clerk's side (or a JWT-claims fix made
// after someone's first login) actually reaches the members table, instead
// of a stale name/email sitting there forever.
export const ensureCurrentMember = mutation({
  args: {},
  returns: v.id("members"),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not signed in");

    const name = identity.name ?? identity.email ?? "New Member";
    const email = identity.email ?? "";

    const existing = await ctx.db
      .query("members")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.tokenIdentifier))
      .unique();
    if (existing) {
      if (existing.name !== name || existing.email !== email) {
        await ctx.db.patch("members", existing._id, { name, email });
      }
      return existing._id;
    }

    return await ctx.db.insert("members", {
      clerkUserId: identity.tokenIdentifier,
      name,
      email,
      role: "chorister",
    });
  },
});

// One-time bootstrap, per docs/guides/self-hosting.md Step 7. CLI-only
// (internalMutation — not reachable from client code), and refuses to run
// once any Admin exists, so it's safe to leave in the codebase permanently.
export const bootstrapFirstAdmin = internalMutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, { email }) => {
    // Full-table .filter() here is deliberate, not an oversight: this runs
    // once ever per deployment, from the CLI, against a members table that
    // stays small by nature (a choir's roster, not a growing user base) —
    // adding a "role" index purely for this one-time check isn't worth it.
    const anyAdmin = await ctx.db
      .query("members")
      .filter((q) => q.eq(q.field("role"), "admin"))
      .first();
    if (anyAdmin) {
      throw new Error("An Admin already exists on this deployment — refusing to run again.");
    }

    const member = await ctx.db
      .query("members")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!member) {
      throw new Error(`No Member found with email ${email} — sign in to the app first, then retry.`);
    }

    await ctx.db.patch("members", member._id, { role: "admin" });
    return null;
  },
});

// CLI-only ops utility (generalizes bootstrapFirstAdmin): set any existing
// Member's Role without going through /members/manage (#12, not built yet).
// Genuinely useful past that point too — a self-hoster fixing a Role by
// hand, or setting up test accounts for authenticated E2E fixtures.
export const setMemberRole = internalMutation({
  args: {
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("director"), v.literal("chorister")),
  },
  returns: v.null(),
  handler: async (ctx, { email, role }) => {
    const member = await ctx.db
      .query("members")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!member) {
      throw new Error(`No Member found with email ${email} — sign in to the app first, then retry.`);
    }
    await ctx.db.patch("members", member._id, { role });
    return null;
  },
});

// CLI-only cleanup counterpart to setMemberRole: removes a Member row by
// email. Exists because E2E test accounts were once granted Roles on the
// production deployment (they now live only on throwaway preview backends),
// and leaving a guessable account with write access on a publicly reachable
// production URL is not something to just document and move on from.
export const removeMemberByEmail = internalMutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, { email }) => {
    const member = await ctx.db
      .query("members")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!member) {
      throw new Error(`No Member found with email ${email}.`);
    }
    await ctx.db.delete("members", member._id);
    return null;
  },
});
