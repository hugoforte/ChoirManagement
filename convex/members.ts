import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentMember } from "./lib/auth";
import schema from "./schema";

// Returns the current signed-in Member's record, or null if signed out or
// if this is their first sign-in and ensureCurrentMember hasn't run yet.
export const viewer = query({
  args: {},
  returns: v.union(v.null(), schema.doc("members")),
  handler: async (ctx) => {
    return await getCurrentMember(ctx);
  },
});

// Create-on-first-login (see docs/research/convex-clerk-integration-pattern.md).
// The frontend calls this once after sign-in; it's a no-op if the Member
// already exists. New Members always start as "chorister" — nobody can
// self-assign elevated access (see Step 7 of docs/guides/self-hosting.md
// for how the very first Admin gets promoted).
export const ensureCurrentMember = mutation({
  args: {},
  returns: v.id("members"),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not signed in");

    const existing = await ctx.db
      .query("members")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.tokenIdentifier))
      .unique();
    if (existing) return existing._id;

    return await ctx.db.insert("members", {
      clerkUserId: identity.tokenIdentifier,
      name: identity.name ?? identity.email ?? "New Member",
      email: identity.email ?? "",
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
