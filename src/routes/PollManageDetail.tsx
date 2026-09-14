// Editing an open Poll (#84): its draft Event metadata and advisory
// deadline, and adding, removing or reordering its Candidate Dates. The
// prompts owed to Members who already answered are #86's; the availability
// grid is #85's; closing on a winner is #87's.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { useTrackedMutation } from "../lib/useTrackedMutation";
import { formatCandidateDate, fromDateInputEndOfDay, toDateInput } from "../lib/datetime";
import { moveItem } from "../lib/reorder";
import {
  emptyCandidateDate,
  isFilled,
  toCandidateDateInput,
  type CandidateDateDraft,
} from "../lib/candidateDate";
import { CandidateDateFields } from "../design/CandidateDateFields";
import { MemberPage, usePageTitle } from "../design/MemberPage";
import { dangerLinkClass, inputClass, labelClass, primaryButtonClass } from "../design/forms";
import NotFound from "./NotFound";

const hintClass = "mt-1 text-xs text-stone-500 dark:text-stone-400";

// Which of the four mutations on this page owns the error slot.
type PollAction = "save" | "add" | "remove" | "reorder";

export default function PollManageDetail() {
  return (
    <MemberPage title="Edit Poll" require="managePolls" backTo={{ to: "/polls", label: "Back to Polls" }}>
      {() => <PollManageDetailContent />}
    </MemberPage>
  );
}

function PollManageDetailContent() {
  const { pollId } = useParams<{ pollId: string }>();
  const id = pollId as Id<"polls">;
  const poll = useQuery(api.polls.get, { pollId: id });

  const { run: updatePoll, pending: saving, error: saveError } = useTrackedMutation(api.polls.update);
  const { run: addDate, pending: adding, error: addError } = useTrackedMutation(api.polls.addCandidateDate);
  const { run: removeDate, error: removeError } = useTrackedMutation(api.polls.removeCandidateDate);
  const {
    run: reorderDates,
    pending: reordering,
    error: reorderError,
  } = useTrackedMutation(api.polls.reorderCandidateDates);

  const [fields, setFields] = useState({ title: "", description: "", location: "", deadline: "" });
  const [newDate, setNewDate] = useState<CandidateDateDraft>(emptyCandidateDate());
  const [lastAction, setLastAction] = useState<PollAction | null>(null);

  usePageTitle(poll?.title);

  useEffect(() => {
    if (!poll) return;
    setFields({
      title: poll.title,
      description: poll.description ?? "",
      location: poll.location ?? "",
      deadline: poll.deadlineAt === undefined ? "" : toDateInput(poll.deadlineAt),
    });
    // Only re-sync when a different Poll loads, not on every keystroke —
    // the same reasoning as EventManageDetail's effect.
  }, [poll ? poll._id : undefined]);

  if (poll === null) return <NotFound />;
  if (poll === undefined) return <p className="text-sm text-stone-500 dark:text-stone-400">Loading…</p>;

  const closed = poll.status === "closed";
  // A useTrackedMutation only ever clears its own error, so showing the
  // first non-null of the four would pin a failed Save above a later
  // successful Add. The single slot belongs to whichever action ran last,
  // which each handler claims before it starts.
  const errors: Record<PollAction, string | null> = {
    save: saveError,
    add: addError,
    remove: removeError,
    reorder: reorderError,
  };
  const error = lastAction === null ? null : errors[lastAction];

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLastAction("save");
    await updatePoll({
      pollId: id,
      title: fields.title,
      // "" normalizes to undefined server-side; a number field has no such
      // convention, so clearing the deadline says so with null.
      description: fields.description,
      location: fields.location,
      deadlineAt: fields.deadline ? fromDateInputEndOfDay(fields.deadline) : null,
    });
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!isFilled(newDate)) return;
    setLastAction("add");
    const added = await addDate({ pollId: id, ...toCandidateDateInput(newDate) });
    if (added !== undefined) setNewDate(emptyCandidateDate());
  }

  function handleMove(candidateDates: Doc<"candidateDates">[], index: number, direction: -1 | 1) {
    const ids = candidateDates.map((c) => c._id);
    const moved = moveItem(ids, index, direction);
    if (moved === ids) return;
    setLastAction("reorder");
    void reorderDates({ pollId: id, candidateDateIds: moved });
  }

  async function handleRemove(candidateDate: Doc<"candidateDates">) {
    const label = formatCandidateDate(candidateDate.startsAt, candidateDate.endsAt);
    if (!confirm(`Remove ${label}? This also deletes any Availability recorded for it.`)) return;
    setLastAction("remove");
    await removeDate({ candidateDateId: candidateDate._id });
  }

  return (
    <div className="max-w-xl space-y-6">
      {closed && (
        <p className="text-sm text-stone-600 dark:text-stone-400">
          This Poll is closed. Closed Polls are read-only.
        </p>
      )}

      <form onSubmit={handleSave} className="space-y-3">
        <fieldset disabled={closed} className="space-y-3">
          <div>
            <label htmlFor="poll-title" className={labelClass}>
              Title
            </label>
            <input
              id="poll-title"
              type="text"
              value={fields.title}
              onChange={(e) => setFields((f) => ({ ...f, title: e.target.value }))}
              required
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div>
            <label htmlFor="poll-description" className={labelClass}>
              Description
            </label>
            <textarea
              id="poll-description"
              value={fields.description}
              onChange={(e) => setFields((f) => ({ ...f, description: e.target.value }))}
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div>
            <label htmlFor="poll-location" className={labelClass}>
              Location
            </label>
            <input
              id="poll-location"
              type="text"
              value={fields.location}
              onChange={(e) => setFields((f) => ({ ...f, location: e.target.value }))}
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div>
            <label htmlFor="poll-deadline" className={labelClass}>
              Response deadline
            </label>
            <input
              id="poll-deadline"
              type="date"
              value={fields.deadline}
              onChange={(e) => setFields((f) => ({ ...f, deadline: e.target.value }))}
              className={`mt-1 ${inputClass}`}
            />
            <p className={hintClass}>Optional, and advisory — a Poll never closes on its own.</p>
          </div>
          <button type="submit" disabled={saving || !fields.title.trim()} className={primaryButtonClass}>
            Save
          </button>
        </fieldset>
      </form>

      <div className="border-t border-stone-200 pt-4 dark:border-stone-800">
        <p className={labelClass}>Candidate Dates</p>
        {poll.candidateDates.length === 0 ? (
          <p className={hintClass}>No Candidate Dates yet.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {poll.candidateDates.map((candidateDate, i) => (
              <li key={candidateDate._id} className="flex items-center justify-between text-sm">
                <span>{formatCandidateDate(candidateDate.startsAt, candidateDate.endsAt)}</span>
                {!closed && (
                  <span className="flex gap-2">
                    <button
                      type="button"
                      aria-label={`Move ${formatCandidateDate(candidateDate.startsAt, candidateDate.endsAt)} up`}
                      onClick={() => handleMove(poll.candidateDates, i, -1)}
                      disabled={i === 0 || reordering}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${formatCandidateDate(candidateDate.startsAt, candidateDate.endsAt)} down`}
                      onClick={() => handleMove(poll.candidateDates, i, 1)}
                      disabled={i === poll.candidateDates.length - 1 || reordering}
                    >
                      ↓
                    </button>
                    <button type="button" onClick={() => handleRemove(candidateDate)} className={dangerLinkClass}>
                      Remove
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {!closed && (
          <form onSubmit={handleAdd} className="mt-3 flex flex-wrap items-center gap-2">
            <CandidateDateFields label="New Candidate Date" value={newDate} onChange={setNewDate} />
            <button type="submit" disabled={adding || !isFilled(newDate)} className={primaryButtonClass}>
              Add date
            </button>
          </form>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
