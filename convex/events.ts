// Member-only Event functions. Vertical-slice scope: just enough for the
// "/" dashboard teaser. RSVP mutations, the full /events list, and
// management routes land with the next slice.
import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireMember } from "./lib/auth";
import schema from "./schema";

export const listUpcoming = query({
  // `now` comes from the client rather than Date.now() inside the handler —
  // reading the wall clock in a query breaks Convex's reactivity model.
  args: { now: v.number() },
  returns: v.array(schema.doc("events")),
  handler: async (ctx, { now }) => {
    await requireMember(ctx);
    return await ctx.db
      .query("events")
      .withIndex("by_starts_at", (q) => q.gte("startsAt", now))
      .order("asc")
      .take(5);
  },
});
