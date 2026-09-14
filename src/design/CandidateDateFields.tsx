// The three inputs a Candidate Date is authored through, shared by the
// create form on /polls/manage and the "add a date" row on
// /polls/manage/:pollId — and available to #86's editing slice rather than
// copied a third time.
//
// The inputs are named by aria-label rather than visible <label>s: a create
// form stacks several of these rows, and nine repeated captions read worse
// than one hint above the group. `label` is the stem each input qualifies,
// so rows on the same page stay distinguishable to assistive tech and to
// Playwright's getByLabel.
import type { CandidateDateDraft } from "../lib/candidateDate";
import { inputClass } from "./forms";

export function CandidateDateFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: CandidateDateDraft;
  onChange: (next: CandidateDateDraft) => void;
}) {
  return (
    <>
      <input
        type="date"
        aria-label={label}
        value={value.date}
        onChange={(e) => onChange({ ...value, date: e.target.value })}
        className={`${inputClass} flex-1`}
      />
      <input
        type="time"
        aria-label={`${label} start time`}
        value={value.startTime}
        onChange={(e) => onChange({ ...value, startTime: e.target.value })}
        className={`${inputClass} flex-1`}
      />
      <input
        type="time"
        aria-label={`${label} end time`}
        value={value.endTime}
        onChange={(e) => onChange({ ...value, endTime: e.target.value })}
        className={`${inputClass} flex-1`}
      />
    </>
  );
}
