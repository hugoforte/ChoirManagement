import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { MemberGate, canManage, isAdmin } from "../lib/memberGate";
import { AppShell, RSVP_BADGE, RSVP_LABEL } from "../design/AppShell";

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
      pageTitle="Events"
    >
      {canManage(viewer) && (
        <Link to="/events/manage" className="mb-4 inline-block text-sm text-teal-600 hover:underline dark:text-teal-400">
          Manage
        </Link>
      )}

      {events === undefined ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No Events yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="px-4 py-2 font-medium">Event</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Location</th>
                <th className="px-4 py-2 font-medium">Your RSVP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {events.map((event) => {
                const status = statusByEvent.get(event._id) ?? "no RSVP";
                return (
                  <tr key={event._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-2.5 font-medium">
                      <Link to={`/events/${event._id}`} className="hover:underline">
                        {event.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                      {new Date(event.startsAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{event.location ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RSVP_BADGE[status]}`}>
                        {RSVP_LABEL[status]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
