---
status: accepted
---

# A Poll precedes its Event rather than living on a proposed Event

`CONTEXT.md` defines an Event as a *scheduled* occurrence, and `events.startsAt` is a required timestamp that the upcoming-events query, the Events list, and the public website all rely on. Date-selection polling needs somewhere to hold dates that are not yet chosen, and the obvious-looking option — give Events a `proposed` state with an optional `startsAt`, and hang the Poll off that — was rejected. It would make `startsAt` optional for every existing consumer, force every Event query and the public site to filter out unscheduled rows, and redefine the most load-bearing word in the glossary in order to serve a feature that touches it once.

Instead a Poll is its own entity that carries *draft* Event metadata (title, description, location) alongside its Candidate Dates. Closing the Poll on a winning Candidate Date materialises a real Event. Every Event in the database therefore still has a real date, and Poll-related code touches existing Events code at exactly one point: the insert.

The cost is a small amount of duplicated metadata between a Poll and the Event it becomes, plus an explicit "promote" step rather than an in-place state transition. Availabilities are not copied into RSVPs at promotion — see the `Availability` and `RSVP` entries in `CONTEXT.md` — so a months-old hypothetical never silently becomes a commitment. Re-dating an *existing* Event by poll is not supported, and would be additive if it is ever wanted.
