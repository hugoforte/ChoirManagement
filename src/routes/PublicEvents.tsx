import { Link } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";

export default function PublicEvents() {
  const events = useQuery(api.public.listEvents);

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Upcoming Events</h1>
        <Link to="/sign-in" className="text-sm text-brand-600 underline hover:text-brand-700">
          Sign in
        </Link>
      </div>

      {events === undefined ? (
        <p className="mt-4 text-gray-500">Loading…</p>
      ) : events.length === 0 ? (
        <p className="mt-4 text-gray-500">No public events right now.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {events.map((event) => (
            <li key={event._id}>
              <Link
                to={`/public/events/${event._id}`}
                className="font-medium text-brand-600 underline hover:text-brand-700"
              >
                {event.title}
              </Link>
              <div className="text-sm text-gray-600">
                {new Date(event.startsAt).toLocaleString()}
                {event.location ? ` — ${event.location}` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
