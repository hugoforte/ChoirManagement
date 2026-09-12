import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { MemberGate, canManage } from "../lib/memberGate";

export default function Events() {
  return <MemberGate>{(viewer) => <EventsContent viewer={viewer} />}</MemberGate>;
}

function EventsContent({ viewer }: { viewer: Doc<"members"> }) {
  const now = useMemo(() => Date.now(), []);
  const events = useQuery(api.events.list, { now });
  const myRsvps = useQuery(api.events.myRsvps);
  const statusByEvent = new Map(myRsvps?.map((r) => [r.eventId, r.status]));

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Events</h1>
        {canManage(viewer) && (
          <Link to="/events/manage" className="text-sm text-brand-600 underline hover:text-brand-700">
            Manage
          </Link>
        )}
      </div>

      {events === undefined ? (
        <p className="mt-4 text-gray-500">Loading…</p>
      ) : events.length === 0 ? (
        <p className="mt-4 text-gray-500">No Events yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {events.map((event) => (
            <li key={event._id} className="flex items-center justify-between">
              <div>
                <Link
                  to={`/events/${event._id}`}
                  className="font-medium text-brand-600 underline hover:text-brand-700"
                >
                  {event.title}
                </Link>
                <div className="text-sm text-gray-600">
                  {new Date(event.startsAt).toLocaleString()}
                  {event.location ? ` — ${event.location}` : ""}
                </div>
              </div>
              <span className="text-sm capitalize text-gray-600">{statusByEvent.get(event._id) ?? "no RSVP"}</span>
            </li>
          ))}
        </ul>
      )}

      <nav className="mt-8">
        <Link to="/" className="text-sm text-gray-600 underline">
          Back to dashboard
        </Link>
      </nav>
    </div>
  );
}
