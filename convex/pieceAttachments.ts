import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireCan } from "./lib/auth";
import { requirePieceAccess } from "./lib/pieceAccess";
import { normalizeOptionalText } from "./lib/text";
import {
  attachmentFormatValidator,
  attachmentPurposeValidator,
  requireCurrentRevisionBelongsToAttachment,
  requirePrimaryScoreEligible,
  requirePurposeAllowedForFormat,
  requireValidVoicePartSelection,
} from "./lib/pieceAttachmentPolicy";
import schema from "./schema";

const MAX_ATTACHMENTS_PER_BATCH = 50;
const MAX_VOICE_PARTS_PER_ATTACHMENT = 20;
const MAX_ATTACHMENTS_PER_PIECE = 200;
const MAX_STORAGE_IDS_TO_DISCARD = 50;
const MAX_LEGACY_PIECES_TO_CHECK = 200;

const attachmentFields = {
  format: attachmentFormatValidator,
  purpose: attachmentPurposeValidator,
  voicePartIds: v.array(v.id("voiceParts")),
  label: v.optional(v.string()),
  filenameOverride: v.optional(v.string()),
  isPrimary: v.boolean(),
};

const reviewedAttachmentValidator = v.object({
  storageId: v.id("_storage"),
  originalFilename: v.string(),
  ...attachmentFields,
  revisionNote: v.optional(v.string()),
  revisionLabel: v.optional(v.string()),
});

const currentAttachmentValidator = v.object({
  attachment: schema.doc("pieceAttachments"),
  currentVersion: schema.doc("pieceFileVersions"),
  url: v.union(v.string(), v.null()),
});

async function listActiveAttachments(
  ctx: QueryCtx | MutationCtx,
  pieceId: Id<"pieces">,
): Promise<Doc<"pieceAttachments">[]> {
  const attachments = await ctx.db
    .query("pieceAttachments")
    .withIndex("by_piece_id_and_status_and_display_order", (q) =>
      q.eq("pieceId", pieceId).eq("status", "active"),
    )
    .order("asc")
    .take(MAX_ATTACHMENTS_PER_PIECE + 1);
  if (attachments.length > MAX_ATTACHMENTS_PER_PIECE) {
    throw new Error(
      `A Piece can have at most ${MAX_ATTACHMENTS_PER_PIECE} active attachments`,
    );
  }
  return attachments;
}

async function resolveCurrentAttachments(
  ctx: QueryCtx,
  attachments: Doc<"pieceAttachments">[],
) {
  return await Promise.all(
    attachments.map(async (attachment) => {
      if (!attachment.currentVersionId) {
        throw new Error("Active attachment has no current revision");
      }
      const currentVersion = await ctx.db.get(
        "pieceFileVersions",
        attachment.currentVersionId,
      );
      if (!currentVersion)
        throw new Error("Active attachment has no current revision");
      requireCurrentRevisionBelongsToAttachment(attachment._id, currentVersion);
      return {
        attachment,
        currentVersion,
        url: await ctx.storage.getUrl(currentVersion.storageId),
      };
    }),
  );
}

async function validateVoiceParts(
  ctx: MutationCtx,
  purpose: Doc<"pieceAttachments">["purpose"],
  voicePartIds: Id<"voiceParts">[],
  allowedArchivedIds: ReadonlySet<Id<"voiceParts">> = new Set(),
): Promise<void> {
  if (voicePartIds.length > MAX_VOICE_PARTS_PER_ATTACHMENT) {
    throw new Error(
      `An attachment can have at most ${MAX_VOICE_PARTS_PER_ATTACHMENT} voice parts`,
    );
  }
  const parts = await Promise.all(
    voicePartIds.map(async (voicePartId) => {
      const part = await ctx.db.get("voiceParts", voicePartId);
      if (!part) throw new Error("Voice part not found");
      if (part.status !== "active" && !allowedArchivedIds.has(part._id)) {
        throw new Error("Voice part is archived");
      }
      return part;
    }),
  );
  requireValidVoicePartSelection(
    purpose,
    parts.map((part) => ({ id: part._id, isAll: part.isAll })),
  );
}

async function requireNoCompetingPrimary(
  ctx: MutationCtx,
  pieceId: Id<"pieces">,
  excludedAttachmentId?: Id<"pieceAttachments">,
): Promise<void> {
  const primaries = await ctx.db
    .query("pieceAttachments")
    .withIndex("by_piece_id_and_status_and_is_primary", (q) =>
      q.eq("pieceId", pieceId).eq("status", "active").eq("isPrimary", true),
    )
    .take(2);
  if (primaries.some((attachment) => attachment._id !== excludedAttachmentId)) {
    throw new Error("A Piece can have only one primary score");
  }
}

async function getStorageMetadata(ctx: MutationCtx, storageId: Id<"_storage">) {
  const metadata = await ctx.db.system.get("_storage", storageId);
  if (!metadata) throw new Error("Uploaded file not found in storage");
  return metadata;
}

async function requireStorageHasNoVersion(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
): Promise<void> {
  const versions = await ctx.db
    .query("pieceFileVersions")
    .withIndex("by_storage_id", (q) => q.eq("storageId", storageId))
    .take(1);
  if (versions.length > 0) {
    throw new Error("Storage file is already referenced by a revision");
  }
}

function requireNonEmptyFilename(filename: string): void {
  if (!filename.trim()) throw new Error("Original filename is required");
}

export const listActive = query({
  args: { pieceId: v.id("pieces") },
  returns: v.array(currentAttachmentValidator),
  handler: async (ctx, { pieceId }) => {
    await requirePieceAccess(ctx, pieceId);
    return await resolveCurrentAttachments(
      ctx,
      await listActiveAttachments(ctx, pieceId),
    );
  },
});

export const getManagementDetail = query({
  args: { pieceId: v.id("pieces") },
  returns: v.object({
    piece: schema.doc("pieces"),
    attachments: v.array(currentAttachmentValidator),
  }),
  handler: async (ctx, { pieceId }) => {
    await requireCan(ctx, "manageLibrary");
    const piece = await requirePieceAccess(ctx, pieceId);
    return {
      piece,
      attachments: await resolveCurrentAttachments(
        ctx,
        await listActiveAttachments(ctx, pieceId),
      ),
    };
  },
});

export const publishBatch = mutation({
  args: {
    pieceId: v.id("pieces"),
    attachments: v.array(reviewedAttachmentValidator),
  },
  returns: v.array(v.id("pieceAttachments")),
  handler: async (ctx, { pieceId, attachments }) => {
    const actor = await requireCan(ctx, "manageLibrary");
    await requirePieceAccess(ctx, pieceId);
    if (attachments.length === 0)
      throw new Error("Publish batch cannot be empty");
    if (attachments.length > MAX_ATTACHMENTS_PER_BATCH) {
      throw new Error(
        `Publish batches are limited to ${MAX_ATTACHMENTS_PER_BATCH} attachments`,
      );
    }

    const storageIds = new Set(
      attachments.map((attachment) => attachment.storageId),
    );
    if (storageIds.size !== attachments.length) {
      throw new Error("A storage file can appear only once in a publish batch");
    }
    const batchPrimaryCount = attachments.filter(
      (attachment) => attachment.isPrimary,
    ).length;
    if (batchPrimaryCount > 1)
      throw new Error("A batch can contain only one primary score");
    if (batchPrimaryCount === 1) await requireNoCompetingPrimary(ctx, pieceId);

    const existingAttachments = await ctx.db
      .query("pieceAttachments")
      .withIndex("by_piece_id_and_status_and_display_order", (q) =>
        q.eq("pieceId", pieceId).eq("status", "active"),
      )
      .take(MAX_ATTACHMENTS_PER_PIECE);
    if (
      existingAttachments.length + attachments.length >
      MAX_ATTACHMENTS_PER_PIECE
    ) {
      throw new Error(
        `A Piece can have at most ${MAX_ATTACHMENTS_PER_PIECE} active attachments`,
      );
    }

    const reviewed = await Promise.all(
      attachments.map(async (attachment) => {
        requireNonEmptyFilename(attachment.originalFilename);
        requirePurposeAllowedForFormat(attachment.format, attachment.purpose);
        if (attachment.isPrimary) {
          requirePrimaryScoreEligible(attachment.format, attachment.purpose);
        }
        await validateVoiceParts(
          ctx,
          attachment.purpose,
          attachment.voicePartIds,
        );
        await requireStorageHasNoVersion(ctx, attachment.storageId);
        return {
          attachment,
          metadata: await getStorageMetadata(ctx, attachment.storageId),
        };
      }),
    );

    const now = Date.now();
    const createdIds: Id<"pieceAttachments">[] = [];
    for (const { attachment, metadata } of reviewed) {
      const attachmentId = await ctx.db.insert("pieceAttachments", {
        pieceId,
        format: attachment.format,
        purpose: attachment.purpose,
        voicePartIds: attachment.voicePartIds,
        label: attachment.label,
        filenameOverride: attachment.filenameOverride,
        displayOrder: existingAttachments.length + createdIds.length,
        isPrimary: attachment.isPrimary,
        status: "active",
        updatedAt: now,
        createdByMemberId: actor._id,
        updatedByMemberId: actor._id,
      });
      const versionId = await ctx.db.insert("pieceFileVersions", {
        attachmentId,
        storageId: attachment.storageId,
        revisionNumber: 1,
        originalFilename: attachment.originalFilename,
        contentType: metadata.contentType,
        size: metadata.size,
        sha256: metadata.sha256,
        uploadedAt: now,
        uploadedByMemberId: actor._id,
        revisionNote: attachment.revisionNote,
        revisionLabel: attachment.revisionLabel,
      });
      await ctx.db.patch("pieceAttachments", attachmentId, {
        currentVersionId: versionId,
      });
      createdIds.push(attachmentId);
    }
    return createdIds;
  },
});

export const updateMetadata = mutation({
  args: {
    pieceId: v.id("pieces"),
    attachmentId: v.id("pieceAttachments"),
    ...attachmentFields,
  },
  returns: v.null(),
  handler: async (ctx, { pieceId, attachmentId, ...fields }) => {
    const actor = await requireCan(ctx, "manageLibrary");
    await requirePieceAccess(ctx, pieceId);
    const attachment = await ctx.db.get("pieceAttachments", attachmentId);
    if (
      !attachment ||
      attachment.pieceId !== pieceId ||
      attachment.status !== "active"
    ) {
      throw new Error("Active attachment not found for this Piece");
    }
    requirePurposeAllowedForFormat(fields.format, fields.purpose);
    if (fields.isPrimary) {
      requirePrimaryScoreEligible(fields.format, fields.purpose);
      await requireNoCompetingPrimary(ctx, pieceId, attachmentId);
    }
    await validateVoiceParts(
      ctx,
      fields.purpose,
      fields.voicePartIds,
      new Set(attachment.voicePartIds),
    );
    if (!attachment.currentVersionId)
      throw new Error("Attachment has no current revision");
    const currentVersion = await ctx.db.get(
      "pieceFileVersions",
      attachment.currentVersionId,
    );
    if (!currentVersion) throw new Error("Attachment has no current revision");
    requireCurrentRevisionBelongsToAttachment(attachmentId, currentVersion);

    await ctx.db.patch("pieceAttachments", attachmentId, {
      ...fields,
      ...("label" in fields && {
        label: normalizeOptionalText(fields.label),
      }),
      ...("filenameOverride" in fields && {
        filenameOverride: normalizeOptionalText(fields.filenameOverride),
      }),
      updatedAt: Date.now(),
      updatedByMemberId: actor._id,
    });
    return null;
  },
});

export const reorder = mutation({
  args: {
    pieceId: v.id("pieces"),
    attachmentIds: v.array(v.id("pieceAttachments")),
  },
  returns: v.null(),
  handler: async (ctx, { pieceId, attachmentIds }) => {
    const actor = await requireCan(ctx, "manageLibrary");
    await requirePieceAccess(ctx, pieceId);
    if (attachmentIds.length > MAX_ATTACHMENTS_PER_PIECE) {
      throw new Error(
        `A Piece can have at most ${MAX_ATTACHMENTS_PER_PIECE} active attachments`,
      );
    }
    const activeAttachments = await listActiveAttachments(ctx, pieceId);
    const expectedIds = new Set(
      activeAttachments.map((attachment) => attachment._id),
    );
    if (
      attachmentIds.length !== expectedIds.size ||
      new Set(attachmentIds).size !== attachmentIds.length ||
      attachmentIds.some((attachmentId) => !expectedIds.has(attachmentId))
    ) {
      throw new Error(
        "Reorder must contain exactly this Piece's active attachment IDs",
      );
    }
    const now = Date.now();
    await Promise.all(
      attachmentIds.map((attachmentId, displayOrder) =>
        ctx.db.patch("pieceAttachments", attachmentId, {
          displayOrder,
          updatedAt: now,
          updatedByMemberId: actor._id,
        }),
      ),
    );
    return null;
  },
});

export const discardUnreferencedStorage = mutation({
  args: { storageIds: v.array(v.id("_storage")) },
  returns: v.null(),
  handler: async (ctx, { storageIds }) => {
    await requireCan(ctx, "manageLibrary");
    if (storageIds.length > MAX_STORAGE_IDS_TO_DISCARD) {
      throw new Error(
        `At most ${MAX_STORAGE_IDS_TO_DISCARD} storage files can be discarded at once`,
      );
    }
    if (new Set(storageIds).size !== storageIds.length) {
      throw new Error("Storage IDs cannot contain duplicates");
    }
    const versionReferences = await Promise.all(
      storageIds.map(async (storageId) => {
        const versions = await ctx.db
          .query("pieceFileVersions")
          .withIndex("by_storage_id", (q) => q.eq("storageId", storageId))
          .take(1);
        return versions.length > 0;
      }),
    );
    const choirSettings = await ctx.db.query("choirSettings").take(2);
    if (choirSettings.length > 1) {
      throw new Error(
        "Cannot prove storage is unreferenced: invalid settings data",
      );
    }
    const legacyPieces = await ctx.db
      .query("pieces")
      .withIndex("by_title")
      .take(MAX_LEGACY_PIECES_TO_CHECK + 1);
    if (legacyPieces.length > MAX_LEGACY_PIECES_TO_CHECK) {
      throw new Error(
        "Cannot prove storage is unreferenced while legacy Piece files remain",
      );
    }
    for (const [index, storageId] of storageIds.entries()) {
      if (versionReferences[index]) {
        throw new Error("Storage file is referenced by an attachment revision");
      }
      if (
        choirSettings[0]?.logoStorageId === storageId ||
        legacyPieces.some((piece) =>
          piece.files.some((file) => file.storageId === storageId),
        )
      ) {
        throw new Error("Storage file is referenced outside Piece attachments");
      }
    }
    await Promise.all(
      storageIds.map((storageId) => ctx.storage.delete(storageId)),
    );
    return null;
  },
});
