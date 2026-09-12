import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { MemberGate, isAdmin } from "../lib/memberGate";
import { AppShell, SectionTitle, DateBadge, RSVP_LABEL, RSVP_DOT } from "../design/AppShell";

export default function Home() {
  return <MemberGate>{(viewer) => <HomeContentForMember viewer={viewer} />}</MemberGate>;
}

function HomeContentForMember({ viewer }: { viewer: Doc<"members"> }) {
  const choirSettings = useQuery(api.choirSettings.get);
  // Stable for the component's lifetime — re-fetching Date.now() on every
  // render would resubscribe the query each time instead of once.
  const now = useMemo(() => Date.now(), []);
  const upcoming = useQuery(api.events.listUpcoming, { now });
  const myRsvps = useQuery(api.events.myRsvps);
  const statusByEvent = new Map(myRsvps?.map((r) => [r.eventId, r.status]));

  return (
    <AppShell
      choirName={choirSettings?.name ?? "ChoirManagement"}
      viewerName={viewer.name}
      showSettings={isAdmin(viewer)}
    >
      <SectionTitle eyebrow="Dashboard" title="Upcoming in your programme" />
      {upcoming === undefined ? (
        <p className="text-stone-500 dark:text-stone-400">Loading…</p>
      ) : upcoming.length === 0 ? (
        <p className="text-stone-500 dark:text-stone-400">Nothing scheduled yet.</p>
      ) : (
        <ul className="divide-y divide-stone-200 dark:divide-stone-800">
          {upcoming.map((event) => {
            const status = statusByEvent.get(event._id) ?? "no RSVP";
            return (
              <li key={event._id} className="flex items-center gap-4 py-4">
                <DateBadge startsAt={event.startsAt} />
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/events/${event._id}`}
                    className="truncate font-medium underline decoration-amber-700/30 underline-offset-2 hover:decoration-amber-700 dark:decoration-amber-400/40"
                  >
                    {event.title}
                  </Link>
                  {event.location && (
                    <p className="font-sans text-sm text-stone-500 dark:text-stone-400">{event.location}</p>
                  )}
                </div>
                <span className="flex shrink-0 items-center gap-1.5 font-sans text-xs text-stone-500 dark:text-stone-400">
                  <span className={`h-2 w-2 rounded-full ${RSVP_DOT[status]}`} />
                  {RSVP_LABEL[status]}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <Link
        to="/events"
        className="mt-6 inline-block font-sans text-sm font-medium text-amber-800 underline decoration-amber-800/40 underline-offset-4 hover:text-amber-900 dark:text-amber-400 dark:decoration-amber-400/40"
      >
        View full events list →
      </Link>
    </AppShell>
  );
}
