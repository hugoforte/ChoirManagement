import { Link } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";

export default function PublicEvents() {
  const events = useQuery(api.public.listEvents);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-base font-semibold">Upcoming Events</h1>
        <Link to="/sign-in" className="text-sm font-medium text-teal-600 hover:underline dark:text-teal-400">
          Sign in
        </Link>
      </header>

      <main className="mx-auto max-w-3xl p-6">
        {events === undefined ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No public events right now.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {events.map((event) => (
                <li key={event._id} className="px-4 py-3">
                  <Link to={`/public/events/${event._id}`} className="text-sm font-medium hover:underline">
                    {event.title}
                  </Link>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {new Date(event.startsAt).toLocaleString()}
                    {event.location ? ` · ${event.location}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
