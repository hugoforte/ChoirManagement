// The one place naming an Availability's values, labels and badge styling,
// the same shape src/lib/rsvp.ts holds for an RSVP — and deliberately a
// separate module, because an Availability is a hypothetical about an
// unchosen date and an RSVP is a commitment to a scheduled Event
// (CONTEXT.md, ADR-0005). They must never share a vocabulary that invites
// one to be rendered as the other.
import type { Doc } from "../../convex/_generated/dataModel";

// Derived from the schema, not restated: a fourth value added to
// availabilities.value becomes a type error here instead of a silently
// missing control.
export type AvailabilityValue = Doc<"availabilities">["value"];

// "If needed" sits between the two, not after them: it is a first-class
// answer, not a shade of "no" (#9), and reading it last would invite
// exactly that reading.
export const AVAILABILITY_VALUES: readonly AvailabilityValue[] = ["available", "if_needed", "unavailable"];

export const AVAILABILITY_LABEL: Record<AvailabilityValue | "not answered", string> = {
  available: "Available",
  if_needed: "If needed",
  unavailable: "Unavailable",
  "not answered": "No answer",
};

export const AVAILABILITY_BADGE: Record<AvailabilityValue | "not answered", string> = {
  available: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400",
  if_needed: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400",
  unavailable: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400",
  "not answered": "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400",
};
