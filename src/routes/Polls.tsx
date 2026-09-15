// The Member-facing Poll list (#88): open Polls first, each showing where
// the viewer stands on answering it, then closed Polls as history with what
// they settled on. Every row links to /polls/:pollId, where the grid stays
// browsable — read-only once the Poll is closed.
//
// No Poll is ever reachable without signing in (#9), which is why this
// renders through MemberPage and has no /public twin. There is deliberately
// no search or filter over the history: the list is bounded server-side
// (polls.listForMember) and a Choir scanning it wants the recent decisions.
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { can } from "../lib/roles";
import { formatCandidateDate, toDateInput } from "../lib/datetime";
import { MemberPage } from "../design/MemberPage";
import { cardClass, linkClass } from "../design/forms";

type PollListItem = FunctionReturnType<typeof api.polls.listForMember>[number];

// Worded so the same badge reads correctly on a closed Poll, where it is a
// record of what the Member did rather than a prompt to do it.
const RESPONSE_STATE_LABEL: Record<PollListItem["responseState"], string> = {
  not_started: "No answers yet",
  partial: "Partly answered",
  complete: "All answered",
};

const RESPONSE_STATE_BADGE: Record<PollListItem["responseState"], string> = {
  not_started: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400",
  partial: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400",
  complete: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400",
};

export default function Polls() {
  return <MemberPage title="Polls">{(viewer) => <PollsContent viewer={viewer} />}</MemberPage>;
}

function PollsContent({ viewer }: { viewer: Doc<"members"> }) {
  const polls = useQuery(api.polls.listForMember, {});

  if (polls === undefined) {
    return <p className="text-sm text-stone-500 dark:text-stone-400">Loading…</p>;
  }

  const open = polls.filter((poll) => poll.status === "open");
  const closed = polls.filter((poll) => poll.status === "closed");

  return (
    <>
      {can(viewer, "managePolls") && (
        <Link to="/polls/manage" className={`mb-4 inline-block ${linkClass}`}>
          Manage
        </Link>
      )}

      {open.length === 0 ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">No open Polls.</p>
      ) : (
        <ul className="space-y-3">
          {open.map((poll) => (
            <PollRow key={poll._id} poll={poll} />
          ))}
        </ul>
      )}

      {closed.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
            History
          </h2>
          <ul className="space-y-3">
            {closed.map((poll) => (
              <PollRow key={poll._id} poll={poll} />
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function PollRow({ poll }: { poll: PollListItem }) {
  return (
    <li className={`${cardClass} p-3`}>
      <div className="flex flex-wrap items-center gap-2">
        <Link to={`/polls/${poll._id}`} className="font-medium hover:underline">
          {poll.title}
        </Link>
        <span className={`rounded-full px-2 py-0.5 text-xs ${RESPONSE_STATE_BADGE[poll.responseState]}`}>
          {RESPONSE_STATE_LABEL[poll.responseState]}
        </span>
      </div>

      <div className="text-sm text-stone-500 dark:text-stone-400">
        {poll.candidateDateCount === 1 ? "1 date" : `${poll.candidateDateCount} dates`}
        {/* Advisory: a deadline passing never closes a Poll (#9). */}
        {poll.status === "open" && poll.deadlineAt !== undefined && ` · responses by ${toDateInput(poll.deadlineAt)}`}
      </div>

      {poll.outcome && (
        <div className="text-sm text-stone-600 dark:text-stone-400">
          {poll.outcome.winningStartsAt === null
            ? "Closed with no winning date"
            : `Settled on ${formatCandidateDate(poll.outcome.winningStartsAt, poll.outcome.winningEndsAt ?? undefined)}`}
          {poll.outcome.resultingEventId && (
            <Link to={`/events/${poll.outcome.resultingEventId}`} className={`ml-2 ${linkClass}`}>
              View the Event
            </Link>
          )}
        </div>
      )}
    </li>
  );
}
