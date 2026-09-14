const pad = (n: number) => String(n).padStart(2, "0");

// Byte-identical in EventsManage.tsx and EventManageDetail.tsx before this
// (see #34) — one copy, and the one place a timezone bug in it gets fixed.
// datetime-local wants "YYYY-MM-DDTHH:mm" in local time, not the UTC ISO
// string Date#toISOString gives — build it from local getters instead.
export function toDatetimeLocal(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// A Candidate Date is "a date, with an optional time window" (CONTEXT.md),
// so its form is a date input plus optional time inputs rather than the
// single datetime-local an Event's startsAt uses. Same local-getters
// reasoning as above.
export function toDateInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTimeInput(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// "YYYY-MM-DD" plus an optional "HH:mm" to a local ms epoch. Parsed field by
// field because `new Date("2026-03-01")` is read as UTC midnight, which is
// the previous day anywhere west of Greenwich — a date-only Candidate Date
// has to store *local* midnight (ADR-0005's one Choir, one time zone).
export function fromDateInput(date: string, time?: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = (time || "00:00").split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes).getTime();
}

// Display for a Candidate Date. Local midnight with no end is exactly what
// the date-only case stores, so it reads as a bare date instead of claiming
// a meeting at 00:00; anything else shows the window it actually carries.
export function formatCandidateDate(startsAt: number, endsAt?: number): string {
  const date = toDateInput(startsAt);
  const start = toTimeInput(startsAt);
  if (endsAt === undefined) return start === "00:00" ? date : `${date} ${start}`;
  const endDate = toDateInput(endsAt);
  const end = endDate === date ? toTimeInput(endsAt) : `${endDate} ${toTimeInput(endsAt)}`;
  return `${date} ${start}–${end}`;
}
