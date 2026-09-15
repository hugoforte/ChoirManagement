// Remarks — per-Piece comments inside a Bulletin — and the Piece reverse
// lookup that is the whole reason they are modelled structurally instead of
// being typed into the Bulletin body (#81, part of #49).
//
// A Remark names its Piece directly rather than a Setlist position, so a
// standalone Bulletin with no Event behind it carries Remarks just as well
// as an anchored one. Pre-filling from an Event's Setlist is a convenience
// in the editor, not a constraint enforced here: any Piece may be remarked
// on, Setlist or not.
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireCan, requireMember } from "./lib/auth";
import schema from "./schema";

// The editor's row: the stored Remark plus its Piece's title, resolved here
// so the editor needn't subscribe to the whole Music Library to label rows.
const remarkEntry = v.object({
  ...schema.tables.bulletinRemarks.validator.fields,
  _id: v.id("bulletinRemarks"),
  _creationTime: v.number(),
  pieceTitle: v.string(),
});

// The reverse-lookup row: a Remark seen from its Piece, carrying enough of
// its Bulletin to date it and link back to it.
const pieceRemarkEntry = v.object({
  _id: v.id("bulletinRemarks"),
  bulletinId: v.id("bulletins"),
  bulletinTitle: v.string(),
  publishedAt: v.number(),
  text: v.string(),
});

// A Piece accumulates Remarks for as long as the Choir sings it, so the
// reverse lookup is bounded twice: the index scan takes only the newest
// rows about this Piece, and the published survivors are then cut to a
// page's worth. Drafts are filtered out after the scan, which is why the
// scan window is the wider of the two.
const PIECE_REMARK_SCAN_LIMIT = 100;
const PIECE_REMARK_LIMIT = 10;

// Bounded by one Bulletin's own authoring — a handful of Remarks, the same
// shape as polls.ts's candidateDatesInOrder.
async function remarksInOrder(ctx: QueryCtx | MutationCtx, bulletinId: Id<"bulletins">) {
  return await ctx.db
    .query("bulletinRemarks")
    .withIndex("by_bulletin_id_and_display_order", (q) => q.eq("bulletinId", bulletinId))
    .order("asc")
    .collect();
}

// A Remark is Bulletin content, so adding, editing, reordering or removing
// one is an edit of the Bulletin: the "edited" timestamp a published
// Bulletin shows beside its published date has to move with its Remarks,
// not only with its body.
async function touchBulletin(ctx: MutationCtx, bulletinId: Id<"bulletins">, memberId: Id<"members">) {
  await ctx.db.patch("bulletins", bulletinId, {
    updatedAt: Date.now(),
    updatedByMemberId: memberId,
  });
}

// One fetch per distinct Piece rather than one per Remark — the Director
// may well leave several Remarks about the same Piece in one Bulletin. Same
// batching shape as public.ts's setlistTitles, including its fallback for a
// Piece deleted out from under the reference.
async function pieceTitlesById(ctx: QueryCtx | MutationCtx, pieceIds: Id<"pieces">[]) {
  return new Map(
    await Promise.all(
      [...new Set(pieceIds)].map(
        async (pieceId) =>
          [pieceId, (await ctx.db.get("pieces", pieceId))?.title ?? "Untitled"] as const,
      ),
    ),
  );
}

// Carries manageBulletins rather than requireMember because it returns a
// draft's Remarks — #82's Member-facing reading view reads a *published*
// Bulletin's Remarks through its own gate.
export const listForBulletin = query({
  args: { bulletinId: v.id("bulletins") },
  returns: v.array(remarkEntry),
  handler: async (ctx, { bulletinId }) => {
    await requireCan(ctx, "manageBulletins");
    const remarks = await remarksInOrder(ctx, bulletinId);
    const titleByPieceId = await pieceTitlesById(
      ctx,
      remarks.map((remark) => remark.pieceId),
    );
    return remarks.map((remark) => ({
      ...remark,
      pieceTitle: titleByPieceId.get(remark.pieceId) ?? "Untitled",
    }));
  },
});

// The Member-facing twin of listForBulletin, for #82's reading view: every
// signed-in Member may read a published Bulletin's Remarks (#49), but a
// draft's stay behind manageBulletins. Returning [] rather than throwing on
// a draft keeps this a companion to bulletins.getPublished, which already
// resolves a draft to the 404 — two rejections for one stale link would be
// one too many.
export const listPublishedForBulletin = query({
  args: { bulletinId: v.id("bulletins") },
  returns: v.array(remarkEntry),
  handler: async (ctx, { bulletinId }) => {
    await requireMember(ctx);
    const bulletin = await ctx.db.get("bulletins", bulletinId);
    if (!bulletin || bulletin.status !== "published") return [];

    const remarks = await remarksInOrder(ctx, bulletinId);
    const titleByPieceId = await pieceTitlesById(
      ctx,
      remarks.map((remark) => remark.pieceId),
    );
    return remarks.map((remark) => ({
      ...remark,
      pieceTitle: titleByPieceId.get(remark.pieceId) ?? "Untitled",
    }));
  },
});

export const add = mutation({
  args: {
    bulletinId: v.id("bulletins"),
    pieceId: v.id("pieces"),
    text: v.string(),
  },
  returns: v.id("bulletinRemarks"),
  handler: async (ctx, { bulletinId, pieceId, text }) => {
    const member = await requireCan(ctx, "manageBulletins");
    if (!(await ctx.db.get("bulletins", bulletinId))) throw new Error("Bulletin not found");
    if (!(await ctx.db.get("pieces", pieceId))) throw new Error("Piece not found");

    const last = await ctx.db
      .query("bulletinRemarks")
      .withIndex("by_bulletin_id_and_display_order", (q) => q.eq("bulletinId", bulletinId))
      .order("desc")
      .first();

    const remarkId = await ctx.db.insert("bulletinRemarks", {
      bulletinId,
      pieceId,
      text,
      displayOrder: (last?.displayOrder ?? -1) + 1,
    });
    await touchBulletin(ctx, bulletinId, member._id);
    return remarkId;
  },
});

export const update = mutation({
  args: { remarkId: v.id("bulletinRemarks"), text: v.string() },
  returns: v.null(),
  handler: async (ctx, { remarkId, text }) => {
    const member = await requireCan(ctx, "manageBulletins");
    const remark = await ctx.db.get("bulletinRemarks", remarkId);
    if (!remark) throw new Error("Remark not found");
    // The editor saves a Remark when its field loses focus, so tabbing
    // through one without typing must not stamp the Bulletin as edited —
    // the same guard, for the same reason, as bulletins.update's.
    if (remark.text === text) return null;

    await ctx.db.patch("bulletinRemarks", remarkId, { text });
    await touchBulletin(ctx, remark.bulletinId, member._id);
    return null;
  },
});

// Leaves a gap in displayOrder rather than renumbering the survivors:
// displayOrder is only ever read as a sort key, and reorder renumbers the
// whole list from scratch anyway.
export const remove = mutation({
  args: { remarkId: v.id("bulletinRemarks") },
  returns: v.null(),
  handler: async (ctx, { remarkId }) => {
    const member = await requireCan(ctx, "manageBulletins");
    const remark = await ctx.db.get("bulletinRemarks", remarkId);
    if (!remark) throw new Error("Remark not found");

    await ctx.db.delete("bulletinRemarks", remarkId);
    await touchBulletin(ctx, remark.bulletinId, member._id);
    return null;
  },
});

// Takes the whole ordered list rather than a move instruction, the same
// shape polls.reorderCandidateDates uses — the client already holds the
// order it wants, and renumbering from scratch can't leave a gap or a tie.
export const reorder = mutation({
  args: {
    bulletinId: v.id("bulletins"),
    remarkIds: v.array(v.id("bulletinRemarks")),
  },
  returns: v.null(),
  handler: async (ctx, { bulletinId, remarkIds }) => {
    const member = await requireCan(ctx, "manageBulletins");
    if (!(await ctx.db.get("bulletins", bulletinId))) throw new Error("Bulletin not found");

    const existing = await remarksInOrder(ctx, bulletinId);
    const existingIds = new Set<string>(existing.map((remark) => remark._id));
    const givenIds = new Set<string>(remarkIds);
    const isPermutation =
      givenIds.size === remarkIds.length &&
      givenIds.size === existingIds.size &&
      remarkIds.every((remarkId) => existingIds.has(remarkId));
    if (!isPermutation) {
      throw new Error("A reorder must list every Remark on the Bulletin exactly once");
    }

    await Promise.all(
      remarkIds.map((remarkId, displayOrder) =>
        ctx.db.patch("bulletinRemarks", remarkId, { displayOrder }),
      ),
    );
    await touchBulletin(ctx, bulletinId, member._id);
    return null;
  },
});

// The Piece reverse lookup: requireMember, not requireCan — a chorister
// opening the Piece they are practising is exactly who this is for (#49).
// Sorted by the Bulletin's publishedAt rather than the Remark's creation
// time, because that is the date shown beside it.
export const listForPiece = query({
  args: { pieceId: v.id("pieces") },
  returns: v.array(pieceRemarkEntry),
  handler: async (ctx, { pieceId }) => {
    await requireMember(ctx);
    const recent = await ctx.db
      .query("bulletinRemarks")
      .withIndex("by_piece_id", (q) => q.eq("pieceId", pieceId))
      .order("desc")
      .take(PIECE_REMARK_SCAN_LIMIT);

    const bulletinById = new Map(
      await Promise.all(
        [...new Set(recent.map((remark) => remark.bulletinId))].map(
          async (bulletinId) => [bulletinId, await ctx.db.get("bulletins", bulletinId)] as const,
        ),
      ),
    );

    return recent
      .flatMap((remark) => {
        const bulletin = bulletinById.get(remark.bulletinId);
        // A draft's Remarks never surface on the Piece (#49). publishedAt
        // is optional in the schema, so a published Bulletin still has to
        // prove it carries one before this row can claim a date.
        if (!bulletin || bulletin.status !== "published" || bulletin.publishedAt === undefined) {
          return [];
        }
        return [
          {
            _id: remark._id,
            bulletinId: bulletin._id,
            bulletinTitle: bulletin.title,
            publishedAt: bulletin.publishedAt,
            text: remark.text,
          },
        ];
      })
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .slice(0, PIECE_REMARK_LIMIT);
  },
});
