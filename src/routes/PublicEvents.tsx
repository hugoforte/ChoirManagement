import { Link } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { ThemeToggle } from "../design/ThemeToggle";

export default function PublicEvents() {
  const events = useQuery(api.public.listEvents);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-6 py-4 dark:border-stone-800 dark:bg-stone-900">
        <h1 className="text-base font-semibold">Upcoming Events</h1>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link to="/sign-in" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl p-6">
        {events === undefined ? (
          <p className="text-sm text-stone-500 dark:text-stone-400">Loading…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-stone-500 dark:text-stone-400">No public events right now.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
            <ul className="divide-y divide-stone-100 dark:divide-stone-800">
              {events.map((event) => (
                <li key={event._id} className="px-4 py-3">
                  <Link to={`/public/events/${event._id}`} className="text-sm font-medium hover:underline">
                    {event.title}
                  </Link>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
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
