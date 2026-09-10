# Convex schema (draft)

PROTOTYPE — resolves wayfinder ticket [#2](https://github.com/hugoforte/ChoirManagement/issues/2). Committed on a throwaway branch (`prototype/convex-schema`) for review; fold the accepted shape into `main` once confirmed. See [`convex/schema.ts`](../../convex/schema.ts) for the actual definitions — this doc only explains the choices that aren't obvious from the code.

## Is there a Choir table?

Yes, but not the way a multi-tenant app would have one: `choirSettings` is a **singleton** table — this deployment serves exactly one Choir (ADR-0001), so it's expected to hold exactly one document, fetched with `.first()` rather than by id. It exists to hold the Choir's own display name/logo/contact info for the public site and Member-facing UI, not to model multiple Choirs.

## Flexible attached files on Piece

`files` is an embedded array of `{ storageId, filename, kind }` on the Piece document, not a separate `pieceFiles` table. Reasoning: file *count* per Piece is small (single digits — the real-world example was PDF + `.mscz` + 4 per-voice MIDI + 2 audio renders), and each entry is metadata-only (the actual bytes live in Convex file storage, referenced by `storageId`), so there's no document-size pressure or independent-querying need that would justify normalizing it into its own table.

## Setlist is inline on Event, not standalone

`setlist` is `v.array(v.id("pieces"))` directly on the Event document — order is the array order. I considered a standalone, reusable `setlists` table (in case a Director wants to reuse the same program across multiple Events), but v1 has no recurring Events, and the already-accepted pattern for that case is "duplicate last week's Event" (from the earlier scope grilling), which naturally copies this array too. Flagging this as a call you can override — if reusing a Setlist independent of duplicating an Event turns out to matter, this becomes a real `setlists` table referenced by `eventId` × `setlistId` instead.

## Public/private visibility isn't enforced by the schema

`events.visibility` is just a field — it does not, by itself, keep a public Convex query from accidentally returning RSVP data or file storage ids for a private Event. That enforcement is entirely a **function-level** concern: a public-facing query must explicitly select only `{title, description, startsAt, location, youtubeUrl, setlist piece titles}` and never touch the `rsvps` table or `members` table at all. This is exactly what ticket #7 (public/private auth architecture) needs to specify precisely — this schema just makes the visibility flag queryable via the `by_visibility_and_starts_at` index so that function can cheaply fetch "public Events, soonest first."

## RSVP uniqueness

Convex doesn't enforce unique indexes. "One RSVP per Member per Event" is a write-time invariant: an RSVP mutation looks up `by_event_and_member` first and patches the existing document if found, inserts if not — there's no schema-level constraint preventing a second row, so this has to be correct in the mutation, not assumed from the schema.

## Member profile fields are synced copies, not live Clerk lookups

`name` and `email` on `members` are copies populated at create-on-first-login (per `docs/research/convex-clerk-integration-pattern.md`), kept fresh by an optional webhook sync — not fetched from Clerk on every read. Clerk remains the source of truth; these fields exist so Convex queries (e.g. "list Members") don't need a round-trip to Clerk's API.

## Also updated

Added **Setlist** and **Visibility** to `CONTEXT.md` — both terms were already in use across tickets/comments but had never been formalized in the glossary.
