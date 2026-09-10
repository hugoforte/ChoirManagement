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
