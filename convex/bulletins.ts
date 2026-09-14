// Authoring a Bulletin: draft, publish, edit, delete (#80, part of #49).
// Reading — the Member-facing archive, Remarks, Share Links — lands in the
// sibling slices; everything here requires `manageBulletins`, so drafts are
// unreachable without it.
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireCan } from "./lib/auth";
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

// Drafts first (newest first), then published Bulletins (most recently
// published first) — the manage view's job is finishing the unfinished, so
// what isn't out yet belongs at the top. Drafts have no publishedAt, so
// within that half the index falls through to _creationTime.
const PAGE_LIMIT = 200;

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
    return await Promise.all(
      [...drafts, ...published].map(async (bulletin) => ({
        ...bulletin,
        eventTitle: bulletin.eventId
          ? ((await ctx.db.get("events", bulletin.eventId))?.title ?? "Unknown Event")
          : null,
      })),
    );
  },
});

// The editor's own read. Returns drafts, so it carries the same gate as
// listAll rather than requireMember — #82 adds the Member-facing read of a
// *published* Bulletin separately.
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
    // Share Link change (#83).
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
export const publish = mutation({
  args: { bulletinId: v.id("bulletins") },
  returns: v.null(),
  handler: async (ctx, { bulletinId }) => {
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
    return null;
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
    // Remarks are owned by their Bulletin and cascade from here; #81 adds
    // that cascade along with the table's first writer.
    await ctx.db.delete("bulletins", bulletinId);
    return null;
  },
});
