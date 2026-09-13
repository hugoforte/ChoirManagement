import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { MemberPage } from "../design/MemberPage";
import { RSVP_BADGE, RSVP_LABEL } from "../design/AppShell";

export default function Home() {
  return <MemberPage title="Dashboard">{() => <HomeContentForMember />}</MemberPage>;
}

// Still split out from the gate, per AGENTS.md: these queries are
// requireMember-backed, so they must not subscribe until MemberPage has
// resolved a real Member.
function HomeContentForMember() {
  // Stable for the component's lifetime — re-fetching Date.now() on every
  // render would resubscribe the query each time instead of once.
  const now = useMemo(() => Date.now(), []);
  const upcoming = useQuery(api.events.listUpcoming, { now });
  const myRsvps = useQuery(api.events.myRsvps);
  const members = useQuery(api.members.list);
  const statusByEvent = new Map(myRsvps?.map((r) => [r.eventId, r.status]));
  const unfilled = upcoming?.filter((e) => !statusByEvent.has(e._id)).length ?? 0;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Upcoming events"
          value={upcoming === undefined ? "…" : String(upcoming.length)}
          accent="text-stone-900 dark:text-stone-100"
        />
        <StatTile
          label="Needs your RSVP"
          value={upcoming === undefined ? "…" : String(unfilled)}
          accent="text-amber-600 dark:text-amber-400"
        />
        <StatTile
          label="Active members"
          value={members === undefined ? "…" : String(members.length)}
          accent="text-brand-600 dark:text-brand-400"
        />
      </div>

      <div className="mt-6 rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-stone-800">
          <h2 className="text-sm font-semibold">Upcoming</h2>
          <Link to="/events" className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
            View all
          </Link>
        </div>
        {upcoming === undefined ? (
          <p className="p-4 text-sm text-stone-500 dark:text-stone-400">Loading…</p>
        ) : upcoming.length === 0 ? (
          <p className="p-4 text-sm text-stone-500 dark:text-stone-400">Nothing scheduled yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {upcoming.map((event) => {
              const status = statusByEvent.get(event._id) ?? "no RSVP";
              return (
                <li key={event._id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <Link to={`/events/${event._id}`} className="truncate font-medium hover:underline">
                      {event.title}
                    </Link>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      {new Date(event.startsAt).toLocaleString()}
                      {event.location ? ` · ${event.location}` : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${RSVP_BADGE[status]}`}>
                    {RSVP_LABEL[status]}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
      <p className="text-xs font-medium tracking-wide text-stone-500 dark:text-stone-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent}`}>{value}</p>
    </div>
  );
}
