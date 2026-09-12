import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import NotFound from "./NotFound";
import { ThemeToggle } from "../design/ThemeToggle";

export default function PublicEventDetail() {
  const { eventId } = useParams<{ eventId: string }>();
  const event = useQuery(api.public.getEvent, { eventId: eventId as Id<"events"> });

  if (event === undefined) return null; // loading
  if (event === null) return <NotFound />;

  if (event.visibility === "private") {
    return (
      <div className="min-h-screen bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
        <header className="flex items-center justify-between border-b border-stone-200 bg-white px-6 py-4 dark:border-stone-800 dark:bg-stone-900">
          <Link to="/public/events" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            ← All events
          </Link>
          <ThemeToggle />
        </header>
        <main className="mx-auto max-w-3xl p-6">
          <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
            <p className="text-sm text-stone-600 dark:text-stone-400">This Event is private.</p>
            <Link
              to="/sign-in"
              className="mt-2 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              Sign in to view it
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-6 py-4 dark:border-stone-800 dark:bg-stone-900">
        <Link to="/public/events" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
          ← All events
        </Link>
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-3xl p-6">
        <div className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900">
          <h1 className="text-lg font-semibold">{event.title}</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {new Date(event.startsAt).toLocaleString()}
            {event.location ? ` · ${event.location}` : ""}
          </p>
          {event.description && <p className="mt-4 text-sm text-stone-700 dark:text-stone-300">{event.description}</p>}
          {event.youtubeUrl && (
            <p className="mt-4">
              <a
                href={event.youtubeUrl}
                className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                Watch on YouTube
              </a>
            </p>
          )}
          {event.setlistTitles.length > 0 && (
            <>
              <h2 className="mt-6 text-xs font-semibold tracking-wide text-stone-500 dark:text-stone-400">
                Setlist
              </h2>
              <ul className="mt-2 divide-y divide-stone-100 text-sm dark:divide-stone-800">
                {event.setlistTitles.map((title, i) => (
                  <li key={i} className="py-1.5">
                    {title}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
