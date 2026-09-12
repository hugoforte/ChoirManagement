import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { MemberGate, canManage, isAdmin } from "../lib/memberGate";
import { AppShell, SectionTitle, DateBadge, RSVP_LABEL, RSVP_DOT } from "../design/AppShell";

export default function Events() {
  return <MemberGate>{(viewer) => <EventsContent viewer={viewer} />}</MemberGate>;
}

function EventsContent({ viewer }: { viewer: Doc<"members"> }) {
  const choirSettings = useQuery(api.choirSettings.get);
  const now = useMemo(() => Date.now(), []);
  const events = useQuery(api.events.list, { now });
  const myRsvps = useQuery(api.events.myRsvps);
  const statusByEvent = new Map(myRsvps?.map((r) => [r.eventId, r.status]));

  return (
    <AppShell
      choirName={choirSettings?.name ?? "ChoirManagement"}
      viewerName={viewer.name}
      showSettings={isAdmin(viewer)}
    >
      <SectionTitle eyebrow="Season" title="Events" />
      {canManage(viewer) && (
        <Link
          to="/events/manage"
          className="mb-6 inline-block font-sans text-sm text-amber-800 underline hover:text-amber-900 dark:text-amber-400"
        >
          Manage
        </Link>
      )}

      {events === undefined ? (
        <p className="text-stone-500 dark:text-stone-400">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-stone-500 dark:text-stone-400">No Events yet.</p>
      ) : (
        <ul className="divide-y divide-stone-200 dark:divide-stone-800">
          {events.map((event) => {
            const status = statusByEvent.get(event._id) ?? "no RSVP";
            return (
              <li key={event._id} className="flex items-start gap-4 py-5">
                <DateBadge startsAt={event.startsAt} />
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/events/${event._id}`}
                    className="font-medium underline decoration-amber-700/30 underline-offset-2 hover:decoration-amber-700 dark:decoration-amber-400/40"
                  >
                    {event.title}
                  </Link>
                  <p className="font-sans text-sm text-stone-500 dark:text-stone-400">
                    {new Date(event.startsAt).toLocaleString()}
                    {event.location ? ` · ${event.location}` : ""}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap pt-1 font-sans text-xs text-stone-500 dark:text-stone-400">
                  <span className={`h-2 w-2 rounded-full ${RSVP_DOT[status]}`} />
                  {RSVP_LABEL[status]}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
