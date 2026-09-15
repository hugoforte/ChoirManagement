// The Poll behind an Event, on that Event's detail page (#87). An Event
// created by promotion carries no RSVPs from the Poll — an Availability is a
// hypothetical about an unchosen date and is never converted into a
// commitment (ADR-0005) — so the Poll's answers are shown for context
// instead, under their own heading and never mixed into the RSVP sections.
//
// Sits last on the page, after the Event's own RSVPs: those are what this
// Event actually has, and a grid of hypotheticals above them would invite
// the reading the ADR exists to prevent.
//
// Renders nothing for an Event no Poll produced, which is most of them.
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { linkClass } from "../../design/forms";
import { AvailabilityGrid } from "./AvailabilityGrid";

export function OriginatingPollAvailability({ eventId }: { eventId: Id<"events"> }) {
  const grid = useQuery(api.polls.getForEvent, { eventId });
  if (!grid) return null;

  return (
    <>
      <h2 className="mt-6 text-xs font-semibold tracking-wide text-stone-500 dark:text-stone-400">
        Availability from the Poll
      </h2>
      <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
        This Event came out of{" "}
        <Link to={`/polls/${grid.poll._id}`} className={linkClass}>
          {grid.poll.title}
        </Link>
        . These are the Availabilities recorded there before a date was chosen — they are not RSVPs.
      </p>
      {/* Read-only: `onSet` is omitted, so no control appears. A closed
          Poll's grid is history. */}
      <div className="mt-2">
        <AvailabilityGrid grid={grid} />
      </div>
    </>
  );
}
