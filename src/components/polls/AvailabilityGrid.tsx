// The named availability grid (#85): every Member as a row, every Candidate
// Date as a column, and the gaps left visible. Extracted as its own
// component because #88 renders the same grid read-only for a closed Poll —
// omit `onSet` and every control disappears, which is also how a closed
// Poll renders here.
//
// Presentational on purpose: it takes the `polls.grid` result rather than
// subscribing itself, so the route owns the one subscription and the
// component stays trivially testable.
import type { FunctionReturnType } from "convex/server";

import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { AVAILABILITY_BADGE, AVAILABILITY_LABEL, AVAILABILITY_VALUES, type AvailabilityValue } from "../../lib/availability";
import { formatCandidateDate } from "../../lib/datetime";

export type PollGrid = NonNullable<FunctionReturnType<typeof api.polls.grid>>;

const cellClass = "border-b border-stone-200 px-3 py-2 text-sm dark:border-stone-800";
const headerClass = `${cellClass} text-left font-medium`;

export function AvailabilityGrid({
  grid,
  onSet,
  pending,
}: {
  grid: PollGrid;
  // Omitted means read-only: a closed Poll here, and every Poll in the
  // history view (#88).
  onSet?: (candidateDateId: Id<"candidateDates">, value: AvailabilityValue) => void;
  pending?: boolean;
}) {
  if (grid.candidateDates.length === 0) {
    return <p className="text-sm text-stone-500 dark:text-stone-400">No Candidate Dates yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse">
        <caption className="sr-only">Availability by Member and Candidate Date</caption>
        <thead>
          <tr>
            <th scope="col" className={headerClass}>
              Member
            </th>
            {grid.candidateDates.map((candidateDate) => (
              <th key={candidateDate._id} scope="col" className={headerClass}>
                {formatCandidateDate(candidateDate.startsAt, candidateDate.endsAt)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((row) => (
            <tr key={row.memberId} className={row.isViewer ? "bg-stone-50 dark:bg-stone-900" : undefined}>
              <th scope="row" className={headerClass}>
                {row.name}
                {row.isViewer && <span className="ml-1 text-xs text-stone-500 dark:text-stone-400">(you)</span>}
              </th>
              {grid.candidateDates.map((candidateDate, column) => {
                const value = row.values[column];
                const dateLabel = formatCandidateDate(candidateDate.startsAt, candidateDate.endsAt);
                return (
                  <td key={candidateDate._id} className={cellClass}>
                    {row.isViewer && onSet ? (
                      <span className="flex gap-1">
                        {AVAILABILITY_VALUES.map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => onSet(candidateDate._id, option)}
                            disabled={pending}
                            aria-pressed={value === option}
                            aria-label={`${AVAILABILITY_LABEL[option]} on ${dateLabel}`}
                            className={`rounded-lg px-2 py-1 text-xs disabled:opacity-50 ${
                              value === option
                                ? "bg-brand-600 text-white"
                                : "border border-stone-300 text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                            }`}
                          >
                            {AVAILABILITY_LABEL[option]}
                          </button>
                        ))}
                      </span>
                    ) : (
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                          AVAILABILITY_BADGE[value ?? "not answered"]
                        }`}
                      >
                        {AVAILABILITY_LABEL[value ?? "not answered"]}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className={headerClass}>
              Tally
            </th>
            {grid.tallies.map((tally, column) => (
              <td key={grid.candidateDates[column]._id} className={`${cellClass} text-stone-600 dark:text-stone-400`}>
                <span className="block text-xs">{tally.available} available</span>
                <span className="block text-xs">{tally.if_needed} if needed</span>
                <span className="block text-xs">{tally.unavailable} unavailable</span>
                <span className="block text-xs">{tally.notAnswered} not answered yet</span>
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
