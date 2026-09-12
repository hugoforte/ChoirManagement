import { Link } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { DateBadge } from "../design/AppShell";

export default function PublicEvents() {
  const events = useQuery(api.public.listEvents);

  return (
    <div className="min-h-screen bg-stone-50 font-serif text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <header className="border-b border-stone-200 dark:border-stone-800">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6 sm:py-6">
          <div>
            <p className="font-sans text-xs uppercase tracking-[0.2em] text-amber-700 dark:text-amber-500">
              Public programme
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">Upcoming Events</h1>
          </div>
          <Link
            to="/sign-in"
            className="font-sans text-sm text-amber-800 underline hover:text-amber-900 dark:text-amber-400"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        {events === undefined ? (
          <p className="text-stone-500 dark:text-stone-400">Loading…</p>
        ) : events.length === 0 ? (
          <p className="text-stone-500 dark:text-stone-400">No public events right now.</p>
        ) : (
          <ul className="divide-y divide-stone-200 dark:divide-stone-800">
            {events.map((event) => (
              <li key={event._id} className="flex items-center gap-4 py-4">
                <DateBadge startsAt={event.startsAt} />
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/public/events/${event._id}`}
                    className="font-medium underline decoration-amber-700/30 underline-offset-2 hover:decoration-amber-700 dark:decoration-amber-400/40"
                  >
                    {event.title}
                  </Link>
                  {event.location && (
                    <p className="font-sans text-sm text-stone-500 dark:text-stone-400">{event.location}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
