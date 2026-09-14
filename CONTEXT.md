# ChoirManagement

An open-source, self-hosted web application for choirs to manage their music library, member roster, and event scheduling.

## Language

**Choir**:
The organization this application is deployed for. Each Choir runs its own self-hosted instance (one Convex Cloud project); there is no shared multi-tenant backend.
_Avoid_: Organization, Tenant, Group

**Member**:
A person belonging to a Choir, with an account and a Role. Includes Admins and Directors, not just Choristers.
_Avoid_: User, Account, Singer

**Role**:
The access level a Member holds within their Choir: Admin, Director, or Chorister.

**Capability**:
A named thing a Role may do — `manageEvents`, `manageLibrary`, `manageRoster`, `assignRoles`, `manageSettings`. The single table mapping Capability to allowed Roles lives in `convex/lib/capabilities.ts`; both the backend (`requireCan`) and the frontend (`can`) read it, so the Role-to-Capability rule is written once, not separately in each. `manageRoster` (page access to the roster) is distinct from `assignRoles` (changing a Member's Role) — a Director holds the former but not the latter.
_Avoid_: Permission (this project's term is Capability), Role (a Role is who; a Capability is what they can do)

**Admin**:
A Role that can manage Members, Roles, and Choir settings.

**Director**:
A Role that can manage the Music Library, the Member roster, and Events.

**Chorister**:
The base Role: can view the Music Library and respond to Events with an RSVP.
_Avoid_: Member (ambiguous with the entity), Singer

**Music Library**:
The collection of Pieces belonging to a Choir.

**Piece**:
A single choral work in the Music Library, with associated files (e.g. sheet music, recordings).
_Avoid_: Song, Work

**Event**:
A scheduled occurrence — rehearsal, concert, or otherwise — that Members RSVP to.
_Avoid_: Rehearsal (too narrow — not all Events are rehearsals)

**RSVP**:
A Member's commitment to a scheduled Event: Yes, No, or Maybe. Three related-but-separate ideas are deliberately kept apart: an RSVP is a commitment to an Event that already has a date; an Availability is a hypothetical about a date that has not been chosen yet; and Attendance (whether they actually showed up) is not yet modeled.
_Avoid_: Attendance, Availability, Response

**Setlist**:
The ordered list of Pieces attached to a single Event. Not a standalone, reusable entity — a Setlist belongs to exactly one Event.
_Avoid_: Program (as a synonym — "program order" is fine as plain English, but the entity is a Setlist)

**Visibility**:
Whether an Event is Public (browsable on the public website without an account — metadata and Setlist piece titles only, never files or RSVPs) or Private (Members only, the default).

**Bulletin**:
A dated, Director-authored post to the whole Choir — most often the notes sent out after a rehearsal, but equally a standalone announcement. A Bulletin may be anchored to one Event or to none, and an Event may accumulate several Bulletins over time.
_Avoid_: Rehearsal Note (the common case, not the concept), Announcement, Notice, Post, Note (already used for the plain-text fields on a Piece and an Event)

**Remark**:
A comment about one Piece carried inside a Bulletin — "watch the cutoff at bar 48". A Remark names its Piece directly rather than a Setlist position, so it works in a Bulletin with no Event behind it.
_Avoid_: Comment, Annotation (reserved for markings on a score), Note

**Share Link**:
A single URL granting read access to one Bulletin, in one of two modes: sign-in-required, or token (opens without an account). Regenerating a Share Link revokes the previous URL. Distinct from Visibility, which is a property of an Event and governs the public website.
_Avoid_: Public link, Magic link, Invite

**Poll**:
A Director's request for the Choir's Availability across several Candidate Dates, used to settle on a date before an Event exists. Closing a Poll on a winning Candidate Date creates the Event; a Poll may also close with no winner.
_Avoid_: Survey (implies arbitrary questions; a Poll only ever asks about dates), Doodle, Vote

**Candidate Date**:
One proposed option within a Poll: a date, with an optional time window. Not an Event — nothing is scheduled until the Poll closes on it.
_Avoid_: Option, Slot, Proposed Event

**Availability**:
A Member's answer about one Candidate Date: Available, Unavailable, or If needed. An Availability is a hypothetical, never a commitment — it does not become an RSVP when the Poll produces an Event.
_Avoid_: RSVP, Response, Attendance
