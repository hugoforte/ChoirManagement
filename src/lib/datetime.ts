// Byte-identical in EventsManage.tsx and EventManageDetail.tsx before this
// (see #34) — one copy, and the one place a timezone bug in it gets fixed.
// datetime-local wants "YYYY-MM-DDTHH:mm" in local time, not the UTC ISO
// string Date#toISOString gives — build it from local getters instead.
export function toDatetimeLocal(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
