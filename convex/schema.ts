// PROTOTYPE — draft for wayfinder ticket #2, part of the map "ChoirManagement
// v1 architecture spec" (#1). Not runnable: no other convex/ files exist yet.
// See docs/architecture/schema.md for the modeling choices behind this file.

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  attachmentFormatValidator,
  attachmentPurposeValidator,
  attachmentStatusValidator,
  defaultVoicePartKeyValidator,
  voicePartStatusValidator,
} from "./lib/pieceAttachmentPolicy";

export default defineSchema({
  // Singleton: this deployment serves exactly one Choir (see ADR-0001), so
  // this table is expected to hold exactly one document, fetched with
  // `ctx.db.query("choirSettings").first()` rather than by id.
  choirSettings: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    contactEmail: v.optional(v.string()),
  }),

  members: defineTable({
    // Clerk's stable tokenIdentifier for this user — the join key between a
    // Clerk identity and this record (see
    // docs/research/convex-clerk-integration-pattern.md). Convex's own
    // guidelines: prefer tokenIdentifier over subject as a global identity
    // key.
    clerkUserId: v.string(),
    name: v.string(),
    email: v.string(),
    role: v.union(
      v.literal("admin"),
      v.literal("director"),
      v.literal("chorister"),
    ),
  })
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_email", ["email"]),

  pieces: defineTable({
    title: v.string(),
    composer: v.optional(v.string()),
    arranger: v.optional(v.string()),
    notes: v.optional(v.string()),
    youtubeUrl: v.optional(v.string()),
    // Legacy attachment shape. Kept required during the additive rollout to
    // structured Piece attachments; #62 migrates these entries and #71 is
    // responsible for removing this field only after rollout verification.
    files: v.array(
      v.object({
        storageId: v.id("_storage"),
        filename: v.string(),
        kind: v.union(
          v.literal("pdf"),
          v.literal("musescore"),
          v.literal("midi"),
          v.literal("audio"),
          v.literal("other"),
        ),
      }),
    ),
  }).index("by_title", ["title"]),

  voiceParts: defineTable({
    name: v.string(),
    normalizedName: v.string(),
    displayOrder: v.number(),
    status: voicePartStatusValidator,
    isAll: v.boolean(),
    defaultKey: v.optional(defaultVoicePartKeyValidator),
    updatedAt: v.number(),
    updatedByMemberId: v.optional(v.id("members")),
  })
    .index("by_default_key", ["defaultKey"])
    .index("by_normalized_name", ["normalizedName"])
    .index("by_status_and_display_order", ["status", "displayOrder"]),

  pieceAttachments: defineTable({
    pieceId: v.id("pieces"),
    format: attachmentFormatValidator,
    purpose: attachmentPurposeValidator,
    voicePartIds: v.array(v.id("voiceParts")),
    label: v.optional(v.string()),
    filenameOverride: v.optional(v.string()),
    displayOrder: v.number(),
    isPrimary: v.boolean(),
    currentVersionId: v.optional(v.id("pieceFileVersions")),
    status: attachmentStatusValidator,
    updatedAt: v.number(),
    createdByMemberId: v.optional(v.id("members")),
    updatedByMemberId: v.optional(v.id("members")),
    recycledAt: v.optional(v.number()),
    recycledByMemberId: v.optional(v.id("members")),
  })
    .index("by_piece_id_and_status_and_display_order", [
      "pieceId",
      "status",
      "displayOrder",
    ])
    .index("by_piece_id_and_status_and_is_primary", [
      "pieceId",
      "status",
      "isPrimary",
    ])
    .index("by_status_and_recycled_at", ["status", "recycledAt"]),

  pieceFileVersions: defineTable({
    attachmentId: v.id("pieceAttachments"),
    storageId: v.id("_storage"),
    revisionNumber: v.number(),
    originalFilename: v.string(),
    contentType: v.optional(v.string()),
    size: v.number(),
    sha256: v.string(),
    durationSeconds: v.optional(v.number()),
    uploadedAt: v.number(),
    uploadedByMemberId: v.optional(v.id("members")),
    revisionNote: v.optional(v.string()),
    revisionLabel: v.optional(v.string()),
  })
    .index("by_attachment_id_and_revision_number", [
      "attachmentId",
      "revisionNumber",
    ])
    .index("by_attachment_id_and_uploaded_at", ["attachmentId", "uploadedAt"])
    .index("by_storage_id", ["storageId"])
    .index("by_uploaded_at", ["uploadedAt"]),

  // Blobs uploaded for an in-progress review batch. Publishing or explicitly
  // cancelling removes these rows in the same transaction as the associated
  // metadata/storage change. #68 will use createdAt for abandoned cleanup.
  pendingPieceUploads: defineTable({
    pieceId: v.id("pieces"),
    storageId: v.id("_storage"),
    uploadedByMemberId: v.id("members"),
    createdAt: v.number(),
  })
    .index("by_storage_id", ["storageId"])
    .index("by_created_at", ["createdAt"]),

  events: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    startsAt: v.number(), // ms epoch
    location: v.optional(v.string()),
    youtubeUrl: v.optional(v.string()), // recording of the performance
    // Ordered Setlist, inline on the Event rather than a standalone
    // reusable entity: v1 doesn't have recurring Events (ADR scope), and
    // the "duplicate last week's rehearsal" pattern already accepted for
    // one-off Events naturally copies this array too. Revisit as a
    // standalone Setlist table only if Directors want to reuse the exact
    // same program across multiple Events independent of duplication.
    setlist: v.array(v.id("pieces")),
    // Public Events expose only this record's non-file, non-RSVP fields
    // (title/description/startsAt/location/youtubeUrl/setlist piece
    // titles) to unauthenticated visitors — enforced by which Convex
    // functions are public, not by anything in this schema (see #7).
    visibility: v.union(v.literal("public"), v.literal("private")),
  })
    .index("by_starts_at", ["startsAt"])
    .index("by_visibility_and_starts_at", ["visibility", "startsAt"]),

  rsvps: defineTable({
    eventId: v.id("events"),
    memberId: v.id("members"),
    status: v.union(v.literal("yes"), v.literal("no"), v.literal("maybe")),
  })
    .index("by_event", ["eventId"])
    .index("by_member", ["memberId"])
    // One RSVP per Member per Event — look this up before insert to decide
    // insert-vs-patch; Convex doesn't enforce uniqueness itself.
    .index("by_event_and_member", ["eventId", "memberId"]),
});
