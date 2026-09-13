import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireMember, requireCan } from "./lib/auth";
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

// All Events, upcoming-first: the >= now half ascending (soonest next),
// then the < now half descending (most recently past) appended after —
// backs both /events (Member view) and /events/manage (director+ view),
// which share the same "all Events" shape.
export const list = query({
  args: { now: v.number() },
  returns: v.array(schema.doc("events")),
  handler: async (ctx, { now }) => {
    await requireMember(ctx);
    const upcoming = await ctx.db
      .query("events")
      .withIndex("by_starts_at", (q) => q.gte("startsAt", now))
      .order("asc")
      .take(200);
    const past = await ctx.db
      .query("events")
      .withIndex("by_starts_at", (q) => q.lt("startsAt", now))
      .order("desc")
      .take(200);
    return [...upcoming, ...past];
  },
});

const rsvpStatus = schema.tables.rsvps.validator.fields.status;
const setlistPieces = v.array(v.object({ _id: v.id("pieces"), title: v.string() }));

async function resolveSetlist(ctx: QueryCtx, setlist: Id<"pieces">[]) {
  return await Promise.all(
    setlist.map(async (pieceId) => ({
      _id: pieceId,
      title: (await ctx.db.get("pieces", pieceId))?.title ?? "Untitled",
    })),
  );
}

// Includes the caller's own RSVP status inline (a single-row lookup) rather
// than requiring a second query subscription just for that one field.
export const get = query({
  args: { eventId: v.id("events") },
  returns: v.union(
    v.null(),
    v.object({
      ...schema.tables.events.validator.fields,
      _id: v.id("events"),
      _creationTime: v.number(),
      setlist: setlistPieces,
      myRsvp: v.union(rsvpStatus, v.null()),
    }),
  ),
  handler: async (ctx, { eventId }) => {
    const member = await requireMember(ctx);
    const event = await ctx.db.get("events", eventId);
    if (!event) return null;

    const myRsvp = await ctx.db
      .query("rsvps")
      .withIndex("by_event_and_member", (q) => q.eq("eventId", eventId).eq("memberId", member._id))
      .unique();

    return {
      ...event,
      setlist: await resolveSetlist(ctx, event.setlist),
      myRsvp: myRsvp?.status ?? null,
    };
  },
});

// The current Member's own RSVP status across every Event, for the /events
// list page's "your status per Event" column — kept separate from `list`
// per docs/architecture/frontend-routes.md's call shape (events + own
// RSVPs are two independent subscriptions).
export const myRsvps = query({
  args: {},
  returns: v.array(v.object({ eventId: v.id("events"), status: rsvpStatus })),
  handler: async (ctx) => {
    const member = await requireMember(ctx);
    const rsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_member", (q) => q.eq("memberId", member._id))
      .collect();
    return rsvps.map((r) => ({ eventId: r.eventId, status: r.status }));
  },
});

// Director+ only, enforced here (not just by the frontend route) — the
// same defense-in-depth reasoning as members.list keeping email off its
// return shape regardless of route gating.
export const roster = query({
  args: { eventId: v.id("events") },
  returns: v.array(v.object({ memberId: v.id("members"), name: v.string(), status: rsvpStatus })),
  handler: async (ctx, { eventId }) => {
    await requireCan(ctx, "manageEvents");
    const rsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();
    return await Promise.all(
      rsvps.map(async (r) => ({
        memberId: r.memberId,
        name: (await ctx.db.get("members", r.memberId))?.name ?? "Unknown Member",
        status: r.status,
      })),
    );
  },
});

// Any Member may RSVP for themselves — upsert keyed on by_event_and_member,
// since Convex doesn't enforce the one-RSVP-per-Member-per-Event rule at
// the schema level.
export const rsvp = mutation({
  args: {
    eventId: v.id("events"),
    status: rsvpStatus,
  },
  returns: v.null(),
  handler: async (ctx, { eventId, status }) => {
    const member = await requireMember(ctx);
    const existing = await ctx.db
      .query("rsvps")
      .withIndex("by_event_and_member", (q) => q.eq("eventId", eventId).eq("memberId", member._id))
      .unique();
    if (existing) {
      await ctx.db.patch("rsvps", existing._id, { status });
    } else {
      await ctx.db.insert("rsvps", { eventId, memberId: member._id, status });
    }
    return null;
  },
});

const eventFields = {
  title: v.string(),
  description: v.optional(v.string()),
  startsAt: v.number(),
  location: v.optional(v.string()),
  youtubeUrl: v.optional(v.string()),
  setlist: v.array(v.id("pieces")),
  visibility: v.union(v.literal("public"), v.literal("private")),
};

export const create = mutation({
  args: eventFields,
  returns: v.id("events"),
  handler: async (ctx, args) => {
    await requireCan(ctx, "manageEvents");
    return await ctx.db.insert("events", args);
  },
});

export const update = mutation({
  args: { eventId: v.id("events"), ...eventFields },
  returns: v.null(),
  handler: async (ctx, { eventId, ...fields }) => {
    await requireCan(ctx, "manageEvents");
    await ctx.db.patch("events", eventId, fields);
    return null;
  },
});

export const remove = mutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    await requireCan(ctx, "manageEvents");
    const rsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();
    await Promise.all(rsvps.map((r) => ctx.db.delete("rsvps", r._id)));
    await ctx.db.delete("events", eventId);
    return null;
  },
});

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Copies everything but the date: "duplicate last week's rehearsal" means
// the new draft is a week after the original, not on the same day (see
// #13's notes on the accepted recurring-feeling pattern for v1, which has
// no true recurrence). The Setlist array copies too — it's inline on the
// Event, not a shared reusable entity (see docs/architecture/schema.md).
export const duplicate = mutation({
  args: { eventId: v.id("events") },
  returns: v.id("events"),
  handler: async (ctx, { eventId }) => {
    await requireCan(ctx, "manageEvents");
    const event = await ctx.db.get("events", eventId);
    if (!event) throw new Error("Event not found");
    return await ctx.db.insert("events", {
      title: event.title,
      description: event.description,
      startsAt: event.startsAt + WEEK_MS,
      location: event.location,
      youtubeUrl: event.youtubeUrl,
      setlist: event.setlist,
      visibility: event.visibility,
    });
  },
});
