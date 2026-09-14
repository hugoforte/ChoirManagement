// What a Candidate Date form row holds before it becomes the
// { startsAt, endsAt } pair convex/polls.ts stores. Kept as the raw input
// strings so a half-filled row is representable: the date is what makes a
// row real, and both times are optional.
import { fromDateInput } from "./datetime";

export type CandidateDateDraft = {
  date: string;
  startTime: string;
  endTime: string;
};

export function emptyCandidateDate(): CandidateDateDraft {
  return { date: "", startTime: "", endTime: "" };
}

export function isFilled(draft: CandidateDateDraft): boolean {
  return draft.date !== "";
}

// A blank start time means the whole day, stored as local midnight; an end
// time turns that date into a window on the same day (CONTEXT.md's "a date,
// with an optional time window").
export function toCandidateDateInput(draft: CandidateDateDraft): {
  startsAt: number;
  endsAt: number | undefined;
} {
  return {
    startsAt: fromDateInput(draft.date, draft.startTime || undefined),
    endsAt: draft.endTime ? fromDateInput(draft.date, draft.endTime) : undefined,
  };
}
