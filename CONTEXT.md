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
A Member's response to an Event: Yes, No, or Maybe. Distinct from Attendance (whether they actually showed up), which is not yet modeled.
_Avoid_: Attendance, Response

**Setlist**:
The ordered list of Pieces attached to a single Event. Not a standalone, reusable entity — a Setlist belongs to exactly one Event.
_Avoid_: Program (as a synonym — "program order" is fine as plain English, but the entity is a Setlist)

**Visibility**:
Whether an Event is Public (browsable on the public website without an account — metadata and Setlist piece titles only, never files or RSVPs) or Private (Members only, the default).
