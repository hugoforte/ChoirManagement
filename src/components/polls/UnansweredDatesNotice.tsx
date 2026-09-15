// "New dates need your answer" (#86): the in-app prompt a Member gets when
// a Candidate Date was added to a Poll they had already answered.
//
// Derived state, never a stored flag (#9) — it is simply the viewer's own
// row read against the Poll's Candidate Dates. That is also why it stays
// silent for a Member who has answered nothing: they have not been
// overtaken by an edit, they just have not responded yet, and the grid
// already says so.
//
// Presentational like AvailabilityGrid: it takes the polls.getGrid result
// the route already subscribes to, so no second subscription exists to go
// stale against the grid beneath it.
import { formatCandidateDate } from "../../lib/datetime";
import type { PollGrid } from "./AvailabilityGrid";

export function UnansweredDatesNotice({ grid }: { grid: PollGrid }) {
  const viewer = grid.rows.find((row) => row.isViewer);
  if (!viewer) return null;

  const unanswered = grid.candidateDates.filter((_, column) => viewer.values[column] === null);
  const hasAnswered = viewer.values.some((value) => value !== null);
  if (!hasAnswered || unanswered.length === 0) return null;

  return (
    <p
      role="status"
      className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
    >
      {unanswered.length === 1
        ? "1 Candidate Date needs your answer: "
        : `${unanswered.length} Candidate Dates need your answer: `}
      {unanswered.map((candidateDate) => formatCandidateDate(candidateDate.startsAt, candidateDate.endsAt)).join(", ")}
    </p>
  );
}
