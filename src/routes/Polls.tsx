// The Member-facing way into a Poll's availability grid (#85): the open
// Polls, each linking to /polls/:pollId. Deliberately minimal — #88 owns
// the full list, the closed-Poll history, and whatever summary each row
// eventually carries. No Poll is ever reachable without signing in (#9),
// which is why this renders through MemberPage and has no /public twin.
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { can } from "../lib/roles";
import { toDateInput } from "../lib/datetime";
import { MemberPage } from "../design/MemberPage";
import { cardClass, linkClass } from "../design/forms";

export default function Polls() {
  return <MemberPage title="Polls">{(viewer) => <PollsContent viewer={viewer} />}</MemberPage>;
}

function PollsContent({ viewer }: { viewer: Doc<"members"> }) {
  const polls = useQuery(api.polls.listOpen, {});

  return (
    <>
      {can(viewer, "managePolls") && (
        <Link to="/polls/manage" className={`mb-4 inline-block ${linkClass}`}>
          Manage
        </Link>
      )}

      {polls === undefined ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">Loading…</p>
      ) : polls.length === 0 ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">No open Polls.</p>
      ) : (
        <ul className="space-y-3">
          {polls.map((poll) => (
            <li key={poll._id} className={`${cardClass} p-3`}>
              <Link to={`/polls/${poll._id}`} className="font-medium hover:underline">
                {poll.title}
              </Link>
              {poll.deadlineAt !== undefined && (
                <div className="text-sm text-stone-500 dark:text-stone-400">
                  responses by {toDateInput(poll.deadlineAt)}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
