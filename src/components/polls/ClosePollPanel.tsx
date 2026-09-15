// Closing a Poll from the manage screen (#87): pick the Candidate Date that
// won and create the Event, or record that no date worked. Both are
// deliberate acts behind a confirmation that names the consequence — a
// deadline passing never closes a Poll, and there is no reopen.
//
// Presentational apart from the one mutation it owns: the route already
// subscribes to polls.getGrid for #86's removal warnings, and the tallies a
// Director chooses a winner by are in that same result. A second
// subscription could only disagree with the numbers on screen.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useTrackedMutation } from "../../lib/useTrackedMutation";
import { formatCandidateDate } from "../../lib/datetime";
import { labelClass, linkClass, mutedLinkClass, primaryButtonClass } from "../../design/forms";
import type { PollGrid } from "./AvailabilityGrid";

const sectionClass = "border-t border-stone-200 pt-4 dark:border-stone-800";
const hintClass = "mt-1 text-xs text-stone-500 dark:text-stone-400";

// Which of the two ways of closing is waiting on its confirmation.
type Closing = "winner" | "noWinner";

// An Event carries a start and nothing else — `events` has no end field — so
// a Candidate Date's window narrows to its start on promotion. Said in the
// confirmation for a date that actually has an end, because that is the only
// case where something is being dropped.
function winnerWarning(startLabel: string, hasEnd: boolean) {
  const carried = hasEnd ? " The Event starts then; the end time is not carried over." : "";
  return `Close this Poll on ${startLabel} and create an Event?${carried} A closed Poll is read-only and cannot be reopened.`;
}

const NO_WINNER_WARNING =
  "Close this Poll with no winner? No Event is created, and a closed Poll is read-only and cannot be reopened.";

export function ClosePollPanel({ grid }: { grid: PollGrid }) {
  const { poll, candidateDates, tallies } = grid;
  const { run: closePoll, pending, error } = useTrackedMutation(api.polls.close);
  const [winningCandidateDateId, setWinningCandidateDateId] = useState<Id<"candidateDates"> | null>(null);
  // Confirmed inline rather than through confirm(), the same way #86's
  // removal is: the warning belongs beside the control it is about, and a
  // native dialog can't carry the Poll's own vocabulary.
  const [confirming, setConfirming] = useState<Closing | null>(null);

  // An inline confirmation swaps controls in and out under the keyboard, so
  // focus is placed deliberately: onto the confirm button when it opens, and
  // back where it came from when it closes. The heading is the fallback for
  // a confirmation that succeeded, because the buttons it came from are gone
  // by then — the panel is showing the outcome instead.
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const winnerButtonRef = useRef<HTMLButtonElement | null>(null);
  const noWinnerButtonRef = useRef<HTMLButtonElement | null>(null);
  const headingRef = useRef<HTMLParagraphElement | null>(null);
  const focusOnCloseRef = useRef<Closing | "heading" | null>(null);

  // Runs after the commit that re-enables the buttons, which a focus() call
  // inside the click handler would beat — a disabled button refuses focus.
  useEffect(() => {
    if (confirming !== null) {
      confirmButtonRef.current?.focus();
      return;
    }
    const target = focusOnCloseRef.current;
    if (target === null) return;
    focusOnCloseRef.current = null;
    if (target === "heading") headingRef.current?.focus();
    else if (target === "winner") winnerButtonRef.current?.focus();
    else noWinnerButtonRef.current?.focus();
  }, [confirming]);

  const closed = poll.status === "closed";
  const chosen = candidateDates.find((c) => c._id === winningCandidateDateId) ?? null;
  const won = candidateDates.find((c) => c._id === poll.winningCandidateDateId) ?? null;

  async function handleClose(which: Closing) {
    // The controls this came from go with the open panel, so focus falls
    // back to the heading, which outlives both branches.
    focusOnCloseRef.current = "heading";
    setConfirming(null);
    if (which === "noWinner") {
      await closePoll({ pollId: poll._id });
      return;
    }
    if (winningCandidateDateId === null) return;
    await closePoll({ pollId: poll._id, winningCandidateDateId });
  }

  return (
    <div className={sectionClass}>
      {/* tabIndex -1 so focus has somewhere to land once the controls it was
          on are replaced by the outcome — never in the tab order itself. */}
      <p ref={headingRef} tabIndex={-1} className={labelClass}>
        {closed ? "Outcome" : "Close this Poll"}
      </p>

      {closed ? (
        won ? (
          <p className="mt-1 text-sm">
            Closed on {formatCandidateDate(won.startsAt)}.{" "}
            {poll.resultingEventId && (
              <Link to={`/events/${poll.resultingEventId}`} className={linkClass}>
                Open the Event this created
              </Link>
            )}
          </p>
        ) : (
          <p className="mt-1 text-sm">Closed with no winner — no date worked, and no Event was created.</p>
        )
      ) : (
        <>
          <p className={hintClass}>
            Availability recorded here stays availability — closing never turns an answer into an RSVP. The Event takes
            the winning date's start; a Candidate Date's end time is not carried over.
          </p>

          {candidateDates.length === 0 ? (
            <p className={hintClass}>Add a Candidate Date before closing on a winner.</p>
          ) : (
            <fieldset className="mt-3" disabled={confirming !== null}>
              <legend className="text-sm">Winning Candidate Date</legend>
              {/* Plain divs, not a list: the Candidate Dates are already a
                  list higher up the page, and giving these radios the same
                  listitem role would make "the Poll's dates" ambiguous to
                  anything reading by role, assistive tech included. */}
              <div className="mt-1 space-y-1">
                {candidateDates.map((candidateDate, column) => {
                  const tally = tallies[column];
                  return (
                    <div key={candidateDate._id}>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="winning-candidate-date"
                          value={candidateDate._id}
                          checked={winningCandidateDateId === candidateDate._id}
                          onChange={() => setWinningCandidateDateId(candidateDate._id)}
                        />
                        <span>{formatCandidateDate(candidateDate.startsAt, candidateDate.endsAt)}</span>
                        <span className="text-xs text-stone-500 dark:text-stone-400">
                          {tally.available} available · {tally.if_needed} if needed · {tally.unavailable} unavailable ·{" "}
                          {tally.notAnswered} not answered yet
                        </span>
                      </label>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {/* Both stay mounted while a confirmation is open, merely
                disabled: unmounting them would leave "Keep it open" with
                nowhere to put focus back. */}
            <button
              type="button"
              ref={winnerButtonRef}
              onClick={() => setConfirming("winner")}
              disabled={pending || winningCandidateDateId === null || confirming !== null}
              className={primaryButtonClass}
            >
              Close and create Event
            </button>
            <button
              type="button"
              ref={noWinnerButtonRef}
              onClick={() => setConfirming("noWinner")}
              disabled={pending || confirming !== null}
              className={linkClass}
            >
              Close with no winner
            </button>
          </div>

          {confirming !== null && (
            <div className="mt-2 flex flex-wrap items-center gap-3 rounded-lg bg-stone-100 px-3 py-2 text-sm dark:bg-stone-800">
              <p role="alert" className="text-stone-700 dark:text-stone-300">
                {confirming === "noWinner" || chosen === null
                  ? NO_WINNER_WARNING
                  : winnerWarning(formatCandidateDate(chosen.startsAt), chosen.endsAt !== undefined)}
              </p>
              <button type="button" ref={confirmButtonRef} onClick={() => handleClose(confirming)} className={linkClass}>
                {confirming === "noWinner" ? "Yes, close with no winner" : "Yes, close and create it"}
              </button>
              <button
                type="button"
                onClick={() => {
                  focusOnCloseRef.current = confirming;
                  setConfirming(null);
                }}
                className={mutedLinkClass}
              >
                Keep it open
              </button>
            </div>
          )}
        </>
      )}

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
