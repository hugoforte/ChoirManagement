import { query } from "./_generated/server";
import { v } from "convex/values";

import { requireMember } from "./lib/auth";
import schema from "./schema";

const MAX_ACTIVE_VOICE_PARTS = 100;

export const listActive = query({
  args: {},
  returns: v.array(schema.doc("voiceParts")),
  handler: async (ctx) => {
    await requireMember(ctx);
    return await ctx.db
      .query("voiceParts")
      .withIndex("by_status_and_display_order", (q) =>
        q.eq("status", "active"),
      )
      .order("asc")
      .take(MAX_ACTIVE_VOICE_PARTS);
  },
});
