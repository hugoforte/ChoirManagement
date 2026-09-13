import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireMember, requireCan } from "./lib/auth";
import schema from "./schema";

const fileFields = schema.tables.pieces.validator.fields.files.element.fields;

export const list = query({
  args: {},
  returns: v.array(schema.doc("pieces")),
  handler: async (ctx) => {
    await requireMember(ctx);
    return await ctx.db.query("pieces").withIndex("by_title").order("asc").take(200);
  },
});

// Enriches file metadata with a signed download/preview URL — the schema
// only stores storageId, not a URL, since URLs are resolved per-request.
export const get = query({
  args: { pieceId: v.id("pieces") },
  returns: v.union(
    v.null(),
    v.object({
      ...schema.tables.pieces.validator.fields,
      _id: v.id("pieces"),
      _creationTime: v.number(),
      files: v.array(v.object({ ...fileFields, url: v.union(v.string(), v.null()) })),
    }),
  ),
  handler: async (ctx, { pieceId }) => {
    await requireMember(ctx);
    const piece = await ctx.db.get("pieces", pieceId);
    if (!piece) return null;
    const files = await Promise.all(
      piece.files.map(async (file) => ({ ...file, url: await ctx.storage.getUrl(file.storageId) })),
    );
    return { ...piece, files };
  },
});

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireCan(ctx, "manageLibrary");
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    composer: v.optional(v.string()),
    arranger: v.optional(v.string()),
    notes: v.optional(v.string()),
    youtubeUrl: v.optional(v.string()),
  },
  returns: v.id("pieces"),
  handler: async (ctx, args) => {
    await requireCan(ctx, "manageLibrary");
    return await ctx.db.insert("pieces", { ...args, files: [] });
  },
});

export const update = mutation({
  args: {
    pieceId: v.id("pieces"),
    title: v.string(),
    composer: v.optional(v.string()),
    arranger: v.optional(v.string()),
    notes: v.optional(v.string()),
    youtubeUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { pieceId, ...fields }) => {
    await requireCan(ctx, "manageLibrary");
    await ctx.db.patch("pieces", pieceId, fields);
    return null;
  },
});

export const remove = mutation({
  args: { pieceId: v.id("pieces") },
  returns: v.null(),
  handler: async (ctx, { pieceId }) => {
    await requireCan(ctx, "manageLibrary");
    const piece = await ctx.db.get("pieces", pieceId);
    if (piece) {
      await Promise.all(piece.files.map((file) => ctx.storage.delete(file.storageId)));
      await ctx.db.delete("pieces", pieceId);
    }
    return null;
  },
});

export const attachFile = mutation({
  args: {
    pieceId: v.id("pieces"),
    storageId: v.id("_storage"),
    filename: v.string(),
    kind: fileFields.kind,
  },
  returns: v.null(),
  handler: async (ctx, { pieceId, storageId, filename, kind }) => {
    await requireCan(ctx, "manageLibrary");
    const piece = await ctx.db.get("pieces", pieceId);
    if (!piece) throw new Error("Piece not found");
    await ctx.db.patch("pieces", pieceId, {
      files: [...piece.files, { storageId, filename, kind }],
    });
    return null;
  },
});

export const detachFile = mutation({
  args: { pieceId: v.id("pieces"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { pieceId, storageId }) => {
    await requireCan(ctx, "manageLibrary");
    const piece = await ctx.db.get("pieces", pieceId);
    if (!piece) throw new Error("Piece not found");
    await ctx.storage.delete(storageId);
    await ctx.db.patch("pieces", pieceId, {
      files: piece.files.filter((file) => file.storageId !== storageId),
    });
    return null;
  },
});
