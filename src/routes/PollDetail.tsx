// Member-facing Poll detail (#85): the named availability grid, and the
// viewer's own row of controls for answering each Candidate Date. Every
// signed-in Member can see every Poll and its full grid (#9) — authoring
// lives behind managePolls on /polls/manage/:pollId. A closed Poll renders
// read-only; the full list and closed-Poll history are #88's.
import { useParams } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useTrackedMutation } from "../lib/useTrackedMutation";
import { toDateInput } from "../lib/datetime";
import type { AvailabilityValue } from "../lib/availability";
import { AvailabilityGrid } from "../components/polls/AvailabilityGrid";
import { MemberPage, usePageTitle } from "../design/MemberPage";
import NotFound from "./NotFound";

export default function PollDetail() {
  return <MemberPage title="Polls">{() => <PollDetailContent />}</MemberPage>;
}

function PollDetailContent() {
  const { pollId } = useParams<{ pollId: string }>();
  const grid = useQuery(api.polls.grid, { pollId: pollId as Id<"polls"> });
  const { run: setAvailability, pending, error } = useTrackedMutation(api.polls.setAvailability);

  usePageTitle(grid?.poll.title);

  if (grid === null) return <NotFound />;
  if (grid === undefined) return <p className="text-sm text-stone-500 dark:text-stone-400">Loading…</p>;

  const { poll } = grid;
  const closed = poll.status === "closed";

  function handleSet(candidateDateId: Id<"candidateDates">, value: AvailabilityValue) {
    void setAvailability({ candidateDateId, value });
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900">
      <h1 className="text-lg font-semibold">{poll.title}</h1>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
        {closed ? "Closed" : "Open"}
        {poll.location ? ` · ${poll.location}` : ""}
        {/* Advisory: a deadline passing never closes a Poll (#9). */}
        {poll.deadlineAt !== undefined && ` · responses by ${toDateInput(poll.deadlineAt)}`}
      </p>
      {poll.description && <p className="mt-4 text-sm text-stone-700 dark:text-stone-300">{poll.description}</p>}
      {closed && (
        <p className="mt-4 text-sm text-stone-600 dark:text-stone-400">
          This Poll is closed. Closed Polls are read-only.
        </p>
      )}

      <div className="mt-6">
        <AvailabilityGrid grid={grid} onSet={closed ? undefined : handleSet} pending={pending} />
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
