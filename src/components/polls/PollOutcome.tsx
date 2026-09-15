// What a closed Poll settled on (#88): the Candidate Date that won and the
// Event it became, or that it closed with no winner. A closed Poll is
// history, not a deleted one — this renders above the grid, which stays
// browsable read-only beside it (#9).
//
// Presentational like AvailabilityGrid, and reads the same polls.getGrid
// result the route already subscribes to: the winning date is found among
// the Poll's own Candidate Dates rather than fetched again.
import { Link } from "react-router-dom";

import type { PollGrid } from "./AvailabilityGrid";
import { formatCandidateDate } from "../../lib/datetime";
import { linkClass } from "../../design/forms";

export function PollOutcome({ poll, candidateDates }: Pick<PollGrid, "poll" | "candidateDates">) {
  const winner = candidateDates.find((candidateDate) => candidateDate._id === poll.winningCandidateDateId);

  if (!winner) {
    return (
      <p className="mt-4 text-sm text-stone-600 dark:text-stone-400">
        This Poll closed with no winning date — no Event came out of it.
      </p>
    );
  }

  return (
    <p className="mt-4 text-sm text-stone-600 dark:text-stone-400">
      This Poll settled on {formatCandidateDate(winner.startsAt, winner.endsAt)}.
      {/* Absent when the Poll closed on a date but its Event was since
          deleted — the Poll still records which date won. */}
      {poll.resultingEventId && (
        <Link to={`/events/${poll.resultingEventId}`} className={`ml-2 ${linkClass}`}>
          View the Event
        </Link>
      )}
    </p>
  );
}
