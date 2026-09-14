// Poll authoring (#84): create a Poll with its Candidate Dates, and list
// every Poll for editing. Closing and promotion arrive with #87.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { useTrackedMutation } from "../lib/useTrackedMutation";
import { fromDateInput, toDateInput } from "../lib/datetime";
import {
  emptyCandidateDate,
  isFilled,
  toCandidateDateInput,
  type CandidateDateDraft,
} from "../lib/candidateDate";
import { CandidateDateFields } from "../design/CandidateDateFields";
import { MemberPage } from "../design/MemberPage";
import { cardClass, dangerLinkClass, inputClass, labelClass, primaryButtonClass } from "../design/forms";

const hintClass = "mt-1 text-xs text-stone-500 dark:text-stone-400";

export default function PollsManage() {
  return (
    <MemberPage title="Manage Polls" require="managePolls" backTo={{ to: "/polls", label: "Back to Polls" }}>
      {() => <PollsManageContent />}
    </MemberPage>
  );
}

function PollsManageContent() {
  const polls = useQuery(api.polls.list, {});
  const { run: createPoll, pending: creating, error: createError } = useTrackedMutation(api.polls.create);

  const [fields, setFields] = useState({ title: "", description: "", location: "", deadline: "" });
  const [rows, setRows] = useState<CandidateDateDraft[]>([emptyCandidateDate()]);

  // A row with no date is an empty slot the Director hasn't filled in, not
  // an error — only the filled ones become Candidate Dates.
  const dates = rows.filter(isFilled);
  const canCreate = fields.title.trim() !== "" && dates.length > 0;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    const pollId = await createPoll({
      title: fields.title.trim(),
      description: fields.description,
      location: fields.location,
      deadlineAt: fields.deadline ? fromDateInput(fields.deadline) : undefined,
      candidateDates: dates.map(toCandidateDateInput),
    });
    if (pollId !== undefined) {
      setFields({ title: "", description: "", location: "", deadline: "" });
      setRows([emptyCandidateDate()]);
    }
  }

  return (
    <>
      <form onSubmit={handleCreate} className="max-w-xl space-y-3">
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
          <p className={hintClass}>
            Draft details for the Event this Poll may become. You can change them until it closes.
          </p>
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

        <div className="border-t border-stone-200 pt-3 dark:border-stone-800">
          <p className={labelClass}>Candidate Dates</p>
          <p className={hintClass}>Date, then an optional start and end time. Leave the times blank for a whole day.</p>
          <ul className="mt-2 space-y-2">
            {rows.map((row, i) => (
              // Rows are only appended and removed, and every input is
              // controlled from this state, so the index is a stable key.
              <li key={i} className="flex flex-wrap items-center gap-2">
                <CandidateDateFields
                  label={`Candidate Date ${i + 1}`}
                  value={row}
                  onChange={(next) => setRows((rs) => rs.map((r, j) => (j === i ? next : r)))}
                />
                <button
                  type="button"
                  onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                  disabled={rows.length === 1}
                  className={`${dangerLinkClass} disabled:opacity-50`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, emptyCandidateDate()])}
            className="mt-2 text-sm text-brand-600 underline hover:text-brand-700 dark:text-brand-400"
          >
            Add another date
          </button>
        </div>

        <button type="submit" disabled={creating || !canCreate} className={primaryButtonClass}>
          Create Poll
        </button>
        {createError && <p className="text-sm text-danger">{createError}</p>}
      </form>

      {polls === undefined ? (
        <p className="mt-6 text-sm text-stone-500 dark:text-stone-400">Loading…</p>
      ) : polls.length === 0 ? (
        <p className="mt-6 text-sm text-stone-500 dark:text-stone-400">No Polls yet.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {polls.map((poll) => (
            <li key={poll._id} className={`${cardClass} p-3`}>
              <Link to={`/polls/manage/${poll._id}`} className="font-medium hover:underline">
                {poll.title}
              </Link>
              <div className="text-sm capitalize text-stone-500 dark:text-stone-400">
                {poll.status}
                {poll.deadlineAt !== undefined && (
                  <span className="normal-case"> · responses by {toDateInput(poll.deadlineAt)}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
