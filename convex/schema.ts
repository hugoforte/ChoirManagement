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
    // Advances when the Member opens the Bulletins list; the Bulletins nav
    // entry compares it against the newest publishedAt to show an unread
    // indicator (#49). Absent until the Member first opens that list.
    lastReadBulletinsAt: v.optional(v.number()),
    // Whether this Member receives the email a Bulletin sends on publish
    // (#52). Absent means opted in: a Member who has never touched the
    // toggle — and every Member already on the roster when this shipped —
    // gets the email, which is the behaviour the email replaces. Only
    // `false` opts out.
    emailBulletins: v.optional(v.boolean()),
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

  // A Director-authored post to the whole Choir (#49), Markdown in `body`
  // and rendered client-side. Members-only content with deliberately no
  // public/private visibility — that concept stays specific to Events, and
  // guest reading happens through a Share Link token instead (ADR-0004).
  bulletins: defineTable({
    title: v.string(),
    // Markdown source. Rendered client-side; raw HTML must not be honoured.
    body: v.string(),
    // At most one Event anchor, optional: a standalone announcement is an
    // equally valid Bulletin. One Event may accumulate several Bulletins.
    eventId: v.optional(v.id("events")),
    status: v.union(v.literal("draft"), v.literal("published")),
    // Set once, on first publish, and never cleared — there is no
    // un-publish. Absent means the Bulletin is still a draft.
    publishedAt: v.optional(v.number()),
    // Doubles as the "edited" timestamp #49 asks for: a published Bulletin
    // shows this alongside publishedAt when it is the later of the two.
    // One field rather than a separate lastEditedAt saying the same thing.
    // Bumped by content edits (title, body, eventId, Remarks) and by
    // publishing — never by issuing or regenerating a Share Link, which
    // would falsely show the Bulletin as edited.
    updatedAt: v.number(),
    createdByMemberId: v.id("members"),
    updatedByMemberId: v.optional(v.id("members")),
    // At most one Share Link per Bulletin (ADR-0004). The token is a bearer
    // credential granting read of this one Bulletin; regenerating it revokes
    // the previous URL. One optional object rather than two loose optional
    // fields, so a token can never exist without its mode. Absent until a
    // Share Link is issued.
    shareLink: v.optional(
      v.object({
        token: v.string(),
        mode: v.union(v.literal("sign_in_required"), v.literal("token")),
      }),
    ),
  })
    // The archive read: published Bulletins, newest first.
    .index("by_status_and_published_at", ["status", "publishedAt"])
    // Event detail listing the Bulletins anchored to it; also the anchor
    // picker's per-Event count.
    .index("by_event_id", ["eventId"])
    // Resolves a token Share Link to its one Bulletin (ADR-0004). The field
    // is optional, so every unshared Bulletin indexes under undefined —
    // #83's query must take `token: v.string()` and never pass an undefined
    // token, or it would match an arbitrary unshared Bulletin.
    .index("by_share_link_token", ["shareLink.token"]),

  // A comment about one Piece carried inside a Bulletin (#49). Owned by its
  // Bulletin: publishing, editing and deleting cascade from there. Names its
  // Piece directly rather than a Setlist position, so a Remark still works
  // in a Bulletin with no Event behind it.
  bulletinRemarks: defineTable({
    bulletinId: v.id("bulletins"),
    pieceId: v.id("pieces"),
    text: v.string(),
    displayOrder: v.number(),
  })
    .index("by_bulletin_id_and_display_order", ["bulletinId", "displayOrder"])
    // The Piece reverse lookup: Piece detail lists recent Remarks about that
    // Piece, newest first, filtered to published Bulletins by the caller.
    .index("by_piece_id", ["pieceId"]),

  // One Member's copy of the email a Bulletin sends on publish (#52). A row
  // per recipient rather than per batch, because the thing a Director needs
  // to see is *which* Member's address bounced — a batch-level count would
  // say "one failed" and leave them guessing. Written `queued` inside the
  // publish transaction, then advanced by the send action and by Resend's
  // delivery webhook.
  bulletinEmailSends: defineTable({
    bulletinId: v.id("bulletins"),
    memberId: v.id("members"),
    // queued → sent once Resend accepts it → delivered/bounced once the
    // webhook says so. `failed` is terminal and always carries `error`.
    status: v.union(
      v.literal("queued"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("bounced"),
      v.literal("failed"),
    ),
    // The Resend component's own EmailId, returned when the send is
    // enqueued. Absent while queued, and absent on a row that failed before
    // it ever reached the provider.
    providerMessageId: v.optional(v.string()),
    // Why this row is `failed` or `bounced`, in the provider's own words.
    // Kept rather than logged: a Director looking at the delivery summary
    // has no access to deployment logs.
    error: v.optional(v.string()),
    updatedAt: v.number(),
  })
    // The per-Bulletin delivery summary on the manage detail page.
    .index("by_bulletin_id", ["bulletinId"])
    // Resolves a webhook event back to its row. The field is optional, so
    // every not-yet-sent row indexes under undefined — the lookup must take
    // a real string id, exactly as bulletins.by_share_link_token must.
    .index("by_provider_message_id", ["providerMessageId"]),

  // A request for the Choir's Availability across several Candidate Dates,
  // used to settle on a date before an Event exists (#9). Carries *draft*
  // Event metadata rather than being a proposed Event, so every row in
  // `events` still has a real startsAt — see ADR-0005.
  polls: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    status: v.union(v.literal("open"), v.literal("closed")),
    // Advisory only: a deadline passing never auto-closes a Poll. Stored as
    // the last millisecond of the chosen local day (#84), so "responses by
    // 1 March" includes all of 1 March.
    deadlineAt: v.optional(v.number()),
    // Set when the Poll closes on a winner. A Poll may also close with no
    // winner, in which case both this and resultingEventId stay absent.
    winningCandidateDateId: v.optional(v.id("candidateDates")),
    // The Event this Poll produced on close. That insert is the single
    // point at which Poll code touches Events code (ADR-0005).
    resultingEventId: v.optional(v.id("events")),
    updatedAt: v.number(),
    createdByMemberId: v.id("members"),
    updatedByMemberId: v.optional(v.id("members")),
  })
    // Open Polls, then closed ones as history; newest first within each, on
    // the _creationTime Convex appends to every index.
    .index("by_status", ["status"])
    // #87's Event detail finds the originating Poll from the Event it
    // produced, to show that Poll's availability alongside the RSVPs.
    .index("by_resulting_event_id", ["resultingEventId"]),

  // One proposed option within a Poll (#9). Represented identically to
  // events.startsAt so that promotion is a straight copy. Assumes one Choir
  // in one local time zone — a date-only Candidate Date stores local
  // midnight, knowingly wrong for a Member answering from another continent.
  candidateDates: defineTable({
    pollId: v.id("polls"),
    startsAt: v.number(), // ms epoch
    endsAt: v.optional(v.number()), // ms epoch, giving a time window
    displayOrder: v.number(),
  }).index("by_poll_id_and_display_order", ["pollId", "displayOrder"]),

  // A Member's answer about one Candidate Date (#9). `if_needed` is kept
  // distinct because collapsing it into "no" destroys exactly the
  // information a Director needs to break a tie. An Availability is a
  // hypothetical and is never copied into an `rsvps` row (ADR-0005).
  availabilities: defineTable({
    candidateDateId: v.id("candidateDates"),
    memberId: v.id("members"),
    value: v.union(
      v.literal("available"),
      v.literal("unavailable"),
      v.literal("if_needed"),
    ),
  })
    .index("by_candidate_date_id", ["candidateDateId"])
    .index("by_member_id", ["memberId"])
    // One Availability per Member per Candidate Date — look this up before
    // insert to decide insert-vs-patch; Convex doesn't enforce uniqueness
    // itself. Same rule as rsvps above, which keeps one RSVP per Member per
    // Event the same way.
    .index("by_candidate_date_id_and_member_id", [
      "candidateDateId",
      "memberId",
    ]),
});
