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

## Bulletins and Polls (#79)

`bulletins`, `bulletinRemarks`, `polls`, `candidateDates` and `availabilities` all landed in one deliberately thin slice, ahead of any query, mutation or UI. Both [#49](https://github.com/hugoforte/ChoirManagement/issues/49) and [#9](https://github.com/hugoforte/ChoirManagement/issues/9) need this file, and they are meant to run as parallel workstreams — landing the tables once, up front, is what stops two agents colliding here on day one. See [`bulletins-and-polls-orchestration.md`](./bulletins-and-polls-orchestration.md).

### A Bulletin has no visibility field

`events.visibility` is not extended to Bulletins. A Bulletin is Members-only content, and the need it actually has is "forward this week's notes to a guest conductor" — a per-recipient act, not a publication. That is served by an optional `shareLink: { token, mode }` object — one object rather than two loose optional fields, so a token can never exist without its mode — where token mode grants unauthenticated read of that one Bulletin and nothing else (ADR-0004). The `by_share_link_token` index covers the nested `shareLink.token` path; because the object is optional, every unshared Bulletin indexes under `undefined`, so the lookup must require a real string token rather than passing one through unchecked. A second public content surface would have had to be kept out of search engines and out of the public Events listing, which is more machinery than a token. As with `events.visibility`, none of this is enforced by the schema: a token read is safe only because of which function serves it.

### One `updatedAt`, not a separate "edited" timestamp

#49 asks a published Bulletin to show an "edited" timestamp alongside its published date. That is `updatedAt` compared against `publishedAt`, not a second `lastEditedAt` field saying the same thing in different words. `publishedAt` is the field that is genuinely write-once: it is set on first publish and never cleared, because there is no un-publish, and its absence is what makes a Bulletin a draft.

### A Remark names its Piece, not a Setlist position

`bulletinRemarks.pieceId` points at the Piece directly. A Setlist position would only exist for a Bulletin anchored to an Event, and an anchor is optional. Naming the Piece is also what makes the reverse lookup possible — `by_piece_id` is how Piece detail shows recent Remarks about the Piece a chorister is practising, with the caller filtering to published Bulletins.

### A Poll precedes its Event (ADR-0005)

`polls` carries *draft* Event metadata (title, description, location) rather than Events gaining a `proposed` status with an optional `startsAt`. Making `startsAt` optional would have rippled through every Events query and the public website in order to serve a feature that touches Events exactly once — the insert on promotion, recorded in `polls.resultingEventId`. `candidateDates.startsAt`/`endsAt` are represented identically to `events.startsAt` so that promotion is a straight copy. That assumes one Choir in one local time zone: a date-only Candidate Date stores local midnight, which is right for everyone in that zone and subtly wrong for a Member answering from another continent. Accepted knowingly.

### Availability uniqueness, the same shape as RSVP

"One Availability per Member per Candidate Date" is a write-time invariant, not a schema constraint — Convex has no unique indexes. `by_candidate_date_id_and_member_id` exists to be read before an insert so the mutation can patch instead, exactly as `by_event_and_member` works for `rsvps`. The resemblance stops there: an Availability is a hypothetical about an unchosen date and is never copied into an `rsvps` row when a Poll produces an Event.

### A delivery row per recipient, not per send (#52)

`bulletinEmailSends` holds one row per Member per Bulletin, not one row per batch. The thing a Director needs from this table is *which* Member's address bounced — a batch-level count would report "one failed" and leave them guessing, and a Director has no access to deployment logs to find out. The row is written `queued` inside the `publish` transaction, advanced to `sent` by the scheduled send action, and to `delivered`/`bounced` by Resend's webhook. `failed` is terminal and always carries `error`.

`by_provider_message_id` resolves a webhook event back to its row. The field is optional — a queued row has no provider id yet — so every unsent row indexes under `undefined`, and the lookup must take a real string id. Same trap as `bulletins.by_share_link_token`.

The rows are owned by their Bulletin and are deleted with it, like Remarks: a delivery summary for a Bulletin that no longer exists has nothing to say.

### `members.emailBulletins` is absent-means-opted-in

Like `lastReadBulletinsAt` above, this is an optional field carrying a per-Member preference, and its absence is meaningful: absent means the Member is emailed. Only an explicit `false` opts out. That is what makes the field additive — every Member already on the roster when #52 shipped keeps receiving the email the feature was built to replace, with no backfill.

### The unread marker is one field on `members`

`members.lastReadBulletinsAt` is optional and is the whole notification model: the Bulletins nav entry compares it against the newest `publishedAt`, and opening the list advances it. No notification table, no feed, no per-Bulletin read receipts — building a general notification model from this one caller's perspective would get it wrong, and #57 keeps that job.

## Also updated

Added **Setlist** and **Visibility** to `CONTEXT.md` — both terms were already in use across tickets/comments but had never been formalized in the glossary.
