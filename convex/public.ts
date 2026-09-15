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

// ---------------------------------------------------------------------------
// Bulletin Share Links (#83, ADR-0004)
//
// The app's only unauthenticated read of Member-only content. A token is a
// bearer credential for exactly one published Bulletin: whoever holds the URL
// reads that Bulletin and nothing else — no roster, no RSVPs, no other
// Bulletin, and nothing of the anchored Event beyond what a printed programme
// would carry. The projections below name every field they return one by one,
// so a field added to `bulletins` or `events` later cannot leak by being
// spread into a response.
// ---------------------------------------------------------------------------

// Bounded like the public Events list: a Bulletin with more Remarks than this
// is not a case this read needs to serve in one response.
const REMARKS_LIMIT = 200;

const sharedBulletinFields = {
  title: v.string(),
  body: v.string(),
  publishedAt: v.number(),
  updatedAt: v.number(),
  // Title, date and location only. Deliberately not `visibility` — whether
  // the Choir lists an Event on its public website is none of a link
  // holder's business — and deliberately no id, so a guest is never handed
  // an internal identifier to try elsewhere.
  event: v.union(
    v.null(),
    v.object({ title: v.string(), startsAt: v.number(), location: v.optional(v.string()) }),
  ),
  // A Remark's Piece by title, the same plain-text treatment the public
  // Setlist gets: no link into the Music Library, no Piece id.
  remarks: v.array(v.object({ pieceTitle: v.string(), text: v.string() })),
};

// The `by_share_link_token` index covers an optional field, so every Bulletin
// without a Share Link indexes under `undefined` — they all share one index
// key. The `token: v.string()` argument on both callers is what keeps an
// undefined from ever reaching this lookup, and that argument is the real
// guard (see schema.ts). `.unique()` is a backstop rather than the guard: it
// throws on multiple matches instead of returning an arbitrary row, so a
// lookup that did land on that shared key would fail loudly — except on a
// deployment holding exactly one unshared Bulletin, where it would quietly
// return it.
async function bulletinByToken(ctx: QueryCtx, token: string) {
  return await ctx.db
    .query("bulletins")
    .withIndex("by_share_link_token", (q) => q.eq("shareLink.token", token))
    .unique();
}

export const getSharedBulletin = query({
  args: { token: v.string() },
  returns: v.union(v.null(), v.object(sharedBulletinFields)),
  handler: async (ctx, { token }) => {
    const bulletin = await bulletinByToken(ctx, token);
    // An unknown token, a revoked link, a draft and a sign-in-required link
    // are all the same `null` here. The route tells them apart through
    // getSharedBulletinMode; this query never explains its refusal.
    if (!bulletin) return null;
    if (bulletin.status !== "published" || bulletin.publishedAt === undefined) return null;
    if (bulletin.shareLink?.mode !== "token") return null;

    const event = bulletin.eventId ? await ctx.db.get("events", bulletin.eventId) : null;
    const remarkRows = await ctx.db
      .query("bulletinRemarks")
      .withIndex("by_bulletin_id_and_display_order", (q) => q.eq("bulletinId", bulletin._id))
      .take(REMARKS_LIMIT);

    return {
      title: bulletin.title,
      body: bulletin.body,
      publishedAt: bulletin.publishedAt,
      updatedAt: bulletin.updatedAt,
      event: event
        ? { title: event.title, startsAt: event.startsAt, location: event.location }
        : null,
      remarks: await Promise.all(
        remarkRows.map(async (remark) => ({
          pieceTitle: (await ctx.db.get("pieces", remark.pieceId))?.title ?? "Untitled",
          text: remark.text,
        })),
      ),
    };
  },
});

// Lets /s/:token decide whether to render the Bulletin or bounce the visitor
// through sign-in, without the route having to guess from a null.
//
// This leaks one bit to a token holder — that a Share Link by this name
// exists and which mode it is in — and no content whatsoever. Acceptable per
// ADR-0004: the token is already a bearer credential, so anyone able to ask
// this question is someone the link was handed to, and a guessed token
// learns nothing but "no".
export const getSharedBulletinMode = query({
  args: { token: v.string() },
  returns: v.union(v.null(), v.literal("token"), v.literal("sign_in_required")),
  handler: async (ctx, { token }) => {
    const bulletin = await bulletinByToken(ctx, token);
    // A draft reads as no link at all, so a token issued before publishing
    // stays inert — including in sign-in mode, which would otherwise send a
    // visitor through sign-in only to find nothing.
    if (!bulletin || bulletin.status !== "published") return null;
    return bulletin.shareLink?.mode ?? null;
  },
});
