// A small, generic display-formatting helper — not RSVP-specific, but it
// lived in design/AppShell.tsx too, parked there alongside the RSVP
// vocabulary that had no other home either (see #31). AppShell goes back
// to being layout; this and rsvp.ts are the two things that moved out.
export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
