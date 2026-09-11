// PROTOTYPE — draft for wayfinder ticket #2, part of the map "ChoirManagement
// v1 architecture spec" (#1). Not runnable: no other convex/ files exist yet.
// See docs/architecture/schema.md for the modeling choices behind this file.

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
    // Flexible attached files — a Piece's real-world folder can hold a PDF,
    // a MuseScore source, several per-voice MIDI files, and audio renders;
    // this isn't a fixed "one PDF + one audio" shape. Embedded array, not a
    // separate table: file count per Piece is small (single digits) and
    // metadata-only (the bytes live in Convex file storage), so there's no
    // document-size or query-shape reason to normalize it out.
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
