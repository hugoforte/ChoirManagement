import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireMember, requireRole } from "./lib/auth";
import schema from "./schema";

// Member-only, not public: nothing in the destination asks for choir
// branding/contact info to be visible on the public site, and this
// module's neighbor (public.ts) is the deliberate place for what's public
// — anything not there is member-only by default, not by omission.
export const get = query({
  args: {},
  returns: v.union(v.null(), schema.doc("choirSettings")),
  handler: async (ctx) => {
    await requireMember(ctx);
    return await ctx.db.query("choirSettings").first();
  },
});

export const update = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRole(ctx, ["admin"]);
    const existing = await ctx.db.query("choirSettings").first();
    if (existing) {
      await ctx.db.patch("choirSettings", existing._id, args);
    } else {
      await ctx.db.insert("choirSettings", args);
    }
    return null;
  },
});
