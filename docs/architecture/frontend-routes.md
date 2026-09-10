# Frontend route map (draft)

PROTOTYPE — resolves wayfinder ticket [#6](https://github.com/hugoforte/ChoirManagement/issues/6). Committed on a throwaway branch (`prototype/frontend-routes`) for review; fold the accepted shape into `main` once confirmed. Route paths, per-route access, and the Convex query/mutation shape each route is expected to call, for the Vite+React SPA (ADR-0003) rendering the schema in [`convex/schema.ts`](../../convex/schema.ts).

**Not covered here**: actual React code, a router library choice, or a `package.json` — this repo has no frontend tooling yet (separate, bigger ticket). This is a design artifact: the path list, the access rule per path, and the data shape per path.

**Updated after #7 resolved**: public routes live under a distinct `/public/...` prefix and call only dedicated `convex/public.ts` functions that never touch `rsvps` or `members` — not a conditional branch inside the authenticated routes. `/` and `/events` below are now member-only; the public surface is `/public/events` and `/public/events/:eventId`.

## Legend

- **Access**: `public` (no login required), `member` (any authenticated Member, any Role), `director+` (Role = admin or director), `admin` (Role = admin only).
- **Convex calls**: named by table + shape, since no `convex/` functions exist yet beyond `schema.ts` — e.g. "query pieces by title" not an actual function name.

## Route table

| Path | Renders | Access | Convex calls |
|---|---|---|---|
| `/` | Home / dashboard: choir name/logo (from `choirSettings`), upcoming Events teaser, quick links into Music Library / Events / (Admin+) management. Unauthenticated visitors hitting `/` (or any member-only route) redirect to `/public/events` — the public "front door." | member | query `choirSettings` singleton (`.first()`); query `events` (all, upcoming first) |
| `/sign-in` | Clerk sign-in (Google OAuth + password, per ADR-0002). | public | none (Clerk-hosted or embedded component; no Convex call) |
| `/public/events` | Public Events list, upcoming first: `visibility=public` Events only (metadata + Setlist piece titles, no RSVP counts), with a persistent "Sign in" affordance. | public | `convex/public.ts`: query Events by `visibility=public`, `startsAt` ascending (`by_visibility_and_starts_at` index) |
| `/public/events/:eventId` | Public Event detail: title/description/date/location, YouTube link, Setlist (plain-text piece titles, no link into the Music Library). If the id resolves to a private Event: "this Event is private — sign in to view." If the id doesn't resolve at all: real 404. | public | `convex/public.ts`: `getEvent` returning one of `null` (no such id) / `{ exists: true, visibility: "private" }` / full public projection |
| `/library` | Music Library: Piece list, searchable/sortable by title (or composer). | member | query `pieces` (all, or by `by_title` index for search/sort) |
| `/library/:pieceId` | Piece detail: title/composer/arranger/notes, YouTube embed/link, list of attached `files` (filename + kind) each downloadable/previewable — no in-app score reader (out of scope, see CONTEXT.md / issue #1). | member | query `pieces` by id; each file resolved via its `storageId` (Convex file storage URL) |
| `/library/manage` | Management view: create/edit/delete Pieces, add/remove/reorder attached files, edit YouTube link. | director+ | mutation insert/patch/delete on `pieces`; mutation to attach/detach a `files` array entry (upload writes to `_storage`, then patches `pieces.files`) |
| `/members` | Member roster: list of Members with name + Role (no email exposed beyond what's needed; see open question below). | member | query `members` (all) |
| `/members/manage` | Management view: edit a Member's Role. Role changes are Admin-only per CONTEXT.md ("Admin: can manage Members, Roles"); Directors manage the roster's day-to-day (per CONTEXT.md "Director: can manage ... the Member roster") but not Role itself — see open question below on how that split renders. | admin (Role field); director+ (non-Role fields, if any exist to manage) | query `members` (all); mutation patch `members.role` (admin only) |
| `/events` | Events list (Member-only now — public access moved to `/public/events`), upcoming first, with each Member's own RSVP status per Event. | member | query `events` (all) + query `rsvps` `by_member` for own status |
| `/events/:eventId` | Event detail: title/description/date/location, YouTube recording link if present, Setlist (ordered Pieces, linked into `/library/:pieceId`), RSVP control (Yes/No/Maybe), and (director+) the roster of who's RSVP'd. | member | query `events` by id; query `pieces` by id for each `setlist` entry; query `rsvps` `by_event_and_member` (own status) + mutation insert/patch on `rsvps`; director+: query `rsvps` `by_event` (full roster) joined against `members` |
| `/events/manage` | Management view: list of Events with create/edit/delete/duplicate ("duplicate last week's Event," per issue #1 decisions) and a visibility (public/private) toggle. | director+ | query `events` (all); mutation insert/patch/delete on `events`, including the `visibility` field and `setlist` array |
| `/events/manage/:eventId` | Event edit form: title/description/date/location/YouTube, Setlist builder (add/remove/reorder Pieces from the Music Library), visibility toggle. | director+ | query `events` by id; query `pieces` (all, for the Setlist picker); mutation patch `events` (including reordering `setlist: v.array(v.id("pieces"))`) |
| `*` (404) | Not-found page. | public | none |

## Notes on Role gating

Per CONTEXT.md: **Admin** manages Members/Roles/choir settings; **Director** manages Music Library, Member roster, and Events; **Chorister** views the Music Library and RSVPs. That means "director+" above (`admin` or `director`) covers Piece and Event management, while **Role management specifically (`/members/manage`'s Role field) is Admin-only** — Directors can be considered `director+` for the roster page's existence but the Edit-Role control within it should only render/mutate for Admins. There is no dedicated `/settings` route in this table for `choirSettings` (name/logo/contact email) even though CONTEXT.md says Admins manage "choir settings" — flagged as an open question below since issue #6 didn't explicitly scope it and no settings-editing UI was named in issue #1's destination.

## Open questions / assumptions flagged for the human

1. **`choirSettings` editing has no route above.** CONTEXT.md lists "choir settings" under what Admins manage, but neither issue #1's destination nor issue #6's question named a settings UI explicitly. Guessed this is out of v1's route scope (settings seeded once at deploy time, not edited via UI) rather than add an unscoped `/settings` route — flag if that's wrong.
4. **Member roster page scope for non-Admin Directors.** CONTEXT.md gives Directors "the Member roster" but Admins "Members, Roles" — assumed this means Directors can view the full roster (same as any Member) but the Role-edit control is Admin-gated, with no separate Director-only roster action identified (e.g. Directors don't appear to add/remove Members in v1, only Admins change Role — since Member records are created via Clerk first-login, not manually). Worth confirming there's no "invite a Member" flow expected in v1.
5. **Piece file preview vs. download only.** Assumed the Piece detail view renders inline preview where the browser can (e.g. PDF in an `<iframe>`/object viewer, audio in an `<audio>` tag) and falls back to a plain download link for other `kind`s (`musescore`, `midi`) — no player/renderer is being built per issue #1's out-of-scope list, so "preview" here means "whatever the browser does natively with the file type," not custom UI.
6. **No standalone `/pieces/:id/edit` split from `/library/manage`.** Assumed Piece editing happens via a modal/inline form on `/library/manage` rather than a dedicated edit route per Piece (unlike Events, which got a dedicated `/events/manage/:eventId` because the Setlist builder is more complex). Flag if a dedicated Piece edit route is wanted for consistency.
