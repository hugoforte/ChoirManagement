// Public, unauthenticated-safe functions only — per #7's resolution, this
// module must never query `rsvps` or `members`, so a public caller can never
// receive RSVP or roster data by construction, not by a conditional that
// could be edited wrong later.
import { query, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";

const publicEventFields = {
  title: v.string(),
  description: v.optional(v.string()),
  startsAt: v.number(),
  location: v.optional(v.string()),
  youtubeUrl: v.optional(v.string()),
  setlistTitles: v.array(v.string()),
};

async function setlistTitles(ctx: QueryCtx, setlist: Id<"pieces">[]) {
  return await Promise.all(
    setlist.map(async (pieceId) => (await ctx.db.get("pieces", pieceId))?.title ?? "Untitled"),
  );
}

export const listEvents = query({
  args: {},
  returns: v.array(v.object({ _id: v.id("events"), ...publicEventFields })),
  handler: async (ctx) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_visibility_and_starts_at", (q) => q.eq("visibility", "public"))
      .order("asc")
      // Bounded: a public Events list has no legitimate reason to grow
      // past a page's worth at once.
      .take(50);

    return await Promise.all(
      events.map(async (event) => ({
        _id: event._id,
        title: event.title,
        description: event.description,
        startsAt: event.startsAt,
        location: event.location,
        youtubeUrl: event.youtubeUrl,
        setlistTitles: await setlistTitles(ctx, event.setlist),
      })),
    );
  },
});

export const getEvent = query({
  args: { eventId: v.id("events") },
  returns: v.union(
    v.null(),
    v.object({ exists: v.literal(true), visibility: v.literal("private") }),
    v.object({
      exists: v.literal(true),
      visibility: v.literal("public"),
      ...publicEventFields,
    }),
  ),
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get("events", eventId);
    if (!event) return null;

    if (event.visibility !== "public") {
      // Exists, but private — the frontend renders "sign in to view," never
      // a plain 404, per #7. Deliberately no other fields on this branch.
      return { exists: true as const, visibility: "private" as const };
    }

    return {
      exists: true as const,
      visibility: "public" as const,
      title: event.title,
      description: event.description,
      startsAt: event.startsAt,
      location: event.location,
      youtubeUrl: event.youtubeUrl,
      setlistTitles: await setlistTitles(ctx, event.setlist),
    };
  },
});
