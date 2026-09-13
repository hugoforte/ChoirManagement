// The one place naming an RSVP's statuses, labels, and badge styling. This
// used to be two: AppShell.tsx's friendlier "Going/Maybe/Declined" labels
// (used by Home.tsx, Events.tsx) and EventDetail.tsx's own raw
// "yes"/"no"/"maybe" render with a capitalize class — so the same RSVP read
// "Going" on the Events list and "Yes" on that same Event's detail page
// (see #31). CONTEXT.md's own RSVP entry names the values Yes/No/Maybe;
// "Going"/"Declined" are the friendlier presentation of the same three
// values, applied everywhere now instead of in two of three places.
export type RsvpStatus = "yes" | "no" | "maybe";

export const RSVP_STATUSES: readonly RsvpStatus[] = ["yes", "no", "maybe"];

export const RSVP_LABEL: Record<RsvpStatus | "no RSVP", string> = {
  yes: "Going",
  maybe: "Maybe",
  no: "Declined",
  "no RSVP": "No reply",
};

export const RSVP_BADGE: Record<RsvpStatus | "no RSVP", string> = {
  yes: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400",
  maybe: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400",
  no: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400",
  "no RSVP": "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400",
};
