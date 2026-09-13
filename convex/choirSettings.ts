import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireMember, requireCan } from "./lib/auth";
import { normalizeOptionalText } from "./lib/text";
import schema from "./schema";

// Member-only, not public: nothing in the destination asks for choir
// branding/contact info to be visible on the public site, and this
// module's neighbor (public.ts) is the deliberate place for what's public
// — anything not there is member-only by default, not by omission.
// Returns a resolved logoUrl alongside the raw storage id, since the
// storage id alone isn't renderable by the frontend (see pieces.ts's
// same pattern for attached files).
export const get = query({
  args: {},
  returns: v.union(
    v.null(),
    schema.doc("choirSettings").extend({ logoUrl: v.union(v.string(), v.null()) }),
  ),
  handler: async (ctx) => {
    await requireMember(ctx);
    const settings = await ctx.db.query("choirSettings").first();
    if (!settings) return null;
    const logoUrl = settings.logoStorageId ? await ctx.storage.getUrl(settings.logoStorageId) : null;
    return { ...settings, logoUrl };
  },
});

export const generateLogoUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireCan(ctx, "manageSettings");
    return await ctx.storage.generateUploadUrl();
  },
});

export const update = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireCan(ctx, "manageSettings");
    const existing = await ctx.db.query("choirSettings").first();
    // Replacing the logo orphans the old file otherwise — nothing else
    // ever references a choirSettings logoStorageId once it's swapped.
    if (existing?.logoStorageId && args.logoStorageId && args.logoStorageId !== existing.logoStorageId) {
      await ctx.storage.delete(existing.logoStorageId);
    }
    const fields = {
      ...args,
      description: normalizeOptionalText(args.description),
      contactEmail: normalizeOptionalText(args.contactEmail),
    };
    if (existing) {
      await ctx.db.patch("choirSettings", existing._id, fields);
    } else {
      await ctx.db.insert("choirSettings", fields);
    }
    return null;
  },
});
