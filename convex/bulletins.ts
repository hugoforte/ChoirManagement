// Everything a Bulletin is read or written through, split at the
// "Member-facing read side" divider below (part of #49).
//
// Above it: authoring — draft, publish, edit, delete — all gated on
// `manageBulletins`, and the only place a draft is ever returned.
// Below it: the Member-facing archive and reading view, gated on
// `requireMember`, where a draft is invisible to every Role.
//
// Remarks (#81) and Share Links (#83) live in their own modules.
import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireCan, requireMember } from "./lib/auth";
import { queueBulletinEmails } from "./bulletinEmails";
import schema from "./schema";

// A manage-list row: the stored Bulletin plus the anchored Event's title,
// resolved here so the list page doesn't need a second subscription to
// every Event just to label one row.
const bulletinListEntry = v.object({
  ...schema.tables.bulletins.validator.fields,
  _id: v.id("bulletins"),
  _creationTime: v.number(),
  eventTitle: v.union(v.string(), v.null()),
});

const PAGE_LIMIT = 200;

const UNKNOWN_EVENT = "Unknown Event";

// An Event may accumulate several Bulletins (#49), so the same anchor recurs
// down a list. Fetch each distinct Event once rather than once per row that
// points at it.
async function eventTitlesByIdFor(
  ctx: QueryCtx,
  bulletins: { eventId?: Id<"events"> }[],
): Promise<Map<Id<"events">, string>> {
  const uniqueEventIds = [...new Set(bulletins.flatMap((b) => (b.eventId ? [b.eventId] : [])))];
  return new Map(
    await Promise.all(
      uniqueEventIds.map(
        async (eventId) =>
          [eventId, (await ctx.db.get("events", eventId))?.title ?? UNKNOWN_EVENT] as const,
      ),
    ),
  );
}

// Drafts first (newest first), then published Bulletins (most recently
// published first) — the manage view's job is finishing the unfinished, so
// what isn't out yet belongs at the top. Drafts have no publishedAt, so
// within that half the index falls through to _creationTime.
export const listAll = query({
  args: {},
  returns: v.array(bulletinListEntry),
  handler: async (ctx) => {
    await requireCan(ctx, "manageBulletins");
    const drafts = await ctx.db
      .query("bulletins")
      .withIndex("by_status_and_published_at", (q) => q.eq("status", "draft"))
      .order("desc")
      .take(PAGE_LIMIT);
    const published = await ctx.db
      .query("bulletins")
      .withIndex("by_status_and_published_at", (q) => q.eq("status", "published"))
      .order("desc")
      .take(PAGE_LIMIT);
    const rows = [...drafts, ...published];
    const titleByEventId = await eventTitlesByIdFor(ctx, rows);

    return rows.map((bulletin) => ({
      ...bulletin,
      eventTitle: bulletin.eventId ? (titleByEventId.get(bulletin.eventId) ?? UNKNOWN_EVENT) : null,
    }));
  },
});

// The editor's own read. Returns drafts, so it carries the same gate as
// listAll rather than requireMember. `getPublished` below is the read every
// other Member makes, and it refuses a draft whoever is asking.
export const get = query({
  args: { bulletinId: v.id("bulletins") },
  returns: v.union(v.null(), schema.doc("bulletins")),
  handler: async (ctx, { bulletinId }) => {
    await requireCan(ctx, "manageBulletins");
    return await ctx.db.get("bulletins", bulletinId);
  },
});

// Title only, like events.createDraft: the compose box on the list page has
// nothing else to give, and the Director fills in body and Event anchor in
// the editor afterward.
export const createDraft = mutation({
  args: { title: v.string() },
  returns: v.id("bulletins"),
  handler: async (ctx, { title }) => {
    const member = await requireCan(ctx, "manageBulletins");
    return await ctx.db.insert("bulletins", {
      title,
      body: "",
      eventId: undefined,
      status: "draft",
      publishedAt: undefined,
      updatedAt: Date.now(),
      createdByMemberId: member._id,
      updatedByMemberId: undefined,
      shareLink: undefined,
    });
  },
});

export const update = mutation({
  args: {
    bulletinId: v.id("bulletins"),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    // Explicit null clears the Event anchor. An `undefined` sent from the
    // client is dropped before it reaches the handler (see
    // lib/text.ts's normalizeOptionalText for the same wire behaviour), so
    // "leave the anchor alone" and "remove the anchor" need distinct values.
    eventId: v.optional(v.union(v.id("events"), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, { bulletinId, title, body, eventId }) => {
    const member = await requireCan(ctx, "manageBulletins");
    const bulletin = await ctx.db.get("bulletins", bulletinId);
    if (!bulletin) throw new Error("Bulletin not found");

    // updatedAt doubles as the "edited" timestamp a published Bulletin shows
    // beside its published date, so only content edits bump it — never a
    // Share Link change (#83), and never a save that changed nothing. The
    // editor sends the whole form on every Save, so opening a published
    // Bulletin and pressing Save would otherwise falsely mark it edited.
    const unchanged =
      (title === undefined || title === bulletin.title) &&
      (body === undefined || body === bulletin.body) &&
      (eventId === undefined || (eventId ?? undefined) === bulletin.eventId);
    if (unchanged) return null;

    await ctx.db.patch("bulletins", bulletinId, {
      ...(title !== undefined && { title }),
      ...(body !== undefined && { body }),
      ...(eventId !== undefined && { eventId: eventId ?? undefined }),
      updatedAt: Date.now(),
      updatedByMemberId: member._id,
    });
    return null;
  },
});

// Irreversible: there is no un-publish (#49). Publishing is also the single
// notification trigger, which is why a second publish is an error rather
// than a no-op — it would otherwise silently re-stamp publishedAt.
//
// `sendEmail` is an explicit argument with no default (#52): a Director
// publishing a minor correction must be able to skip the email, and the
// choice has to be made at the one moment it can be made at all. Because a
// Bulletin publishes exactly once, a later edit can never re-send — that
// falls out of the lifecycle rather than needing a rule of its own.
//
// Returns the number of Members being emailed, which is zero both when the
// Director declined and when this deployment has no mail provider.
export const publish = mutation({
  args: { bulletinId: v.id("bulletins"), sendEmail: v.boolean() },
  returns: v.number(),
  handler: async (ctx, { bulletinId, sendEmail }) => {
    const member = await requireCan(ctx, "manageBulletins");
    const bulletin = await ctx.db.get("bulletins", bulletinId);
    if (!bulletin) throw new Error("Bulletin not found");
    if (bulletin.status === "published") throw new Error("Bulletin is already published");

    // Same instant for both, so the freshly published Bulletin doesn't
    // immediately read as edited.
    const now = Date.now();
    await ctx.db.patch("bulletins", bulletinId, {
      status: "published",
      publishedAt: now,
      updatedAt: now,
      updatedByMemberId: member._id,
    });

    // Queueing writes rows and schedules an action; the network call itself
    // happens in that action, never here.
    return sendEmail ? await queueBulletinEmails(ctx, bulletinId) : 0;
  },
});

// Deleting a draft needs manageBulletins; deleting a published Bulletin
// additionally needs deletePublishedBulletins (admin) — a narrower rule
// inside a page the broader capability already gates (#49).
export const remove = mutation({
  args: { bulletinId: v.id("bulletins") },
  returns: v.null(),
  handler: async (ctx, { bulletinId }) => {
    await requireCan(ctx, "manageBulletins");
    const bulletin = await ctx.db.get("bulletins", bulletinId);
    if (!bulletin) throw new Error("Bulletin not found");
    if (bulletin.status === "published") {
      await requireCan(ctx, "deletePublishedBulletins");
    }
    // Remarks are owned by their Bulletin (#49), so they go with it —
    // otherwise they would linger on the by_piece_id index the Piece
    // reverse lookup reads.
    const remarks = await ctx.db
      .query("bulletinRemarks")
      .withIndex("by_bulletin_id_and_display_order", (q) => q.eq("bulletinId", bulletinId))
      .collect();
    await Promise.all(remarks.map((remark) => ctx.db.delete("bulletinRemarks", remark._id)));

    // The delivery rows are owned by their Bulletin too (#52) — a summary of
    // emails for a Bulletin that no longer exists has nothing to say, and
    // leaving them would keep answering Resend's webhook forever.
    const sends = await ctx.db
      .query("bulletinEmailSends")
      .withIndex("by_bulletin_id", (q) => q.eq("bulletinId", bulletinId))
      .collect();
    await Promise.all(sends.map((send) => ctx.db.delete("bulletinEmailSends", send._id)));

    await ctx.db.delete("bulletins", bulletinId);
    return null;
  },
});

// ---------------------------------------------------------------------------
// The Member-facing read side (#82): the archive, the reading view, and the
// unread marker. `requireMember`, not `manageBulletins` — every signed-in
// Member reads every published Bulletin, there is no per-Bulletin audience
// (#49). Drafts are excluded here for *every* Role, managers included: the
// manage route stays the only way to reach one, so a half-written Bulletin
// can never be linked to from a reading URL.

// Deliberately not the whole document. `shareLink.token` is a bearer
// credential (ADR-0004) with no business being on a read every Member makes,
// and the list needs a title rather than the anchored Event's id.
const publishedBulletinEntry = v.object({
  _id: v.id("bulletins"),
  title: v.string(),
  publishedAt: v.number(),
  updatedAt: v.number(),
  eventId: v.union(v.id("events"), v.null()),
  eventTitle: v.union(v.string(), v.null()),
});

const publishedBulletin = publishedBulletinEntry.extend({ body: v.string() });

// `publishedAt` is optional on the table because a draft has none; every row
// these queries project is published, so it is set. The fallback keeps the
// projection total instead of throwing on a row that could only exist if it
// had been written around `publish`.
function projectPublished(bulletin: Doc<"bulletins">, eventTitle: string | null) {
  return {
    _id: bulletin._id,
    title: bulletin.title,
    publishedAt: bulletin.publishedAt ?? bulletin._creationTime,
    updatedAt: bulletin.updatedAt,
    eventId: bulletin.eventId ?? null,
    eventTitle,
  };
}

// Newest first, and paginated rather than collected: the archive is the one
// list in the app that only grows — a choir posting weekly has hundreds of
// rows within a few years, and none of them past the first screen matter.
export const listPublished = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(publishedBulletinEntry),
  handler: async (ctx, { paginationOpts }) => {
    await requireMember(ctx);
    const result = await ctx.db
      .query("bulletins")
      .withIndex("by_status_and_published_at", (q) => q.eq("status", "published"))
      .order("desc")
      .paginate(paginationOpts);

    const titleByEventId = await eventTitlesByIdFor(ctx, result.page);
    return {
      ...result,
      page: result.page.map((bulletin) =>
        projectPublished(
          bulletin,
          bulletin.eventId ? (titleByEventId.get(bulletin.eventId) ?? UNKNOWN_EVENT) : null,
        ),
      ),
    };
  },
});

// null covers both "no such Bulletin" and "that Bulletin is a draft", for
// every Role — a manager reading a draft goes through `get` on the manage
// route. Distinguishing the two would tell an unprivileged caller that a
// draft exists at that id, which is the one thing the draft state is for.
export const getPublished = query({
  args: { bulletinId: v.id("bulletins") },
  returns: v.union(v.null(), publishedBulletin),
  handler: async (ctx, { bulletinId }) => {
    await requireMember(ctx);
    const bulletin = await ctx.db.get("bulletins", bulletinId);
    if (!bulletin || bulletin.status !== "published") return null;

    const event = bulletin.eventId ? await ctx.db.get("events", bulletin.eventId) : null;
    return {
      ...projectPublished(bulletin, bulletin.eventId ? (event?.title ?? UNKNOWN_EVENT) : null),
      body: bulletin.body,
    };
  },
});

// The whole unread marker: one timestamp on the Member against the newest
// publish, no notification records and no per-Bulletin receipts (#57 owns
// that). Takes no `now` because it compares two stored instants — the wall
// clock never enters into it, which is also why it may live in a query.
export const hasUnread = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const member = await requireMember(ctx);
    const newest = await ctx.db
      .query("bulletins")
      .withIndex("by_status_and_published_at", (q) => q.eq("status", "published"))
      .order("desc")
      .first();
    if (!newest) return false;

    // Absent means the Member has never opened the list, so everything
    // published is unread.
    if (member.lastReadBulletinsAt === undefined) return true;
    return (newest.publishedAt ?? newest._creationTime) > member.lastReadBulletinsAt;
  },
});

// Called on mount by the archive route. The clock is read here rather than
// passed in: this timestamp is only ever compared against publishedAt, which
// `publish` stamps server-side, so taking it from the browser would mis-read
// the unread marker on any device whose clock runs fast or slow — and would
// let a client write an arbitrary instant into its own Member row. A mutation
// rather than a query because a query may neither write nor read the clock;
// that ban doesn't extend to mutations, and the other writers in this file
// call Date.now() the same way.
export const markBulletinsRead = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const member = await requireMember(ctx);
    await ctx.db.patch("members", member._id, { lastReadBulletinsAt: Date.now() });
    return null;
  },
});
