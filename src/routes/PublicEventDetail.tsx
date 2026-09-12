import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import NotFound from "./NotFound";

export default function PublicEventDetail() {
  const { eventId } = useParams<{ eventId: string }>();
  const event = useQuery(api.public.getEvent, { eventId: eventId as Id<"events"> });

  if (event === undefined) return null; // loading
  if (event === null) return <NotFound />;

  if (event.visibility === "private") {
    return (
      <div className="min-h-screen bg-stone-50 font-serif text-stone-900 dark:bg-stone-950 dark:text-stone-100">
        <header className="border-b border-stone-200 dark:border-stone-800">
          <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6 sm:py-6">
            <Link
              to="/public/events"
              className="font-sans text-sm text-amber-800 underline hover:text-amber-900 dark:text-amber-400"
            >
              ← All events
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
          <p className="font-sans text-stone-600 dark:text-stone-400">This Event is private.</p>
          <Link
            to="/sign-in"
            className="font-sans text-sm text-amber-800 underline hover:text-amber-900 dark:text-amber-400"
          >
            Sign in to view it
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 font-serif text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <header className="border-b border-stone-200 dark:border-stone-800">
        <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6 sm:py-6">
          <Link
            to="/public/events"
            className="font-sans text-sm text-amber-800 underline hover:text-amber-900 dark:text-amber-400"
          >
            ← All events
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-semibold tracking-tight">{event.title}</h1>
        <p className="mt-1 font-sans text-sm text-stone-500 dark:text-stone-400">
          {new Date(event.startsAt).toLocaleString()}
          {event.location ? ` · ${event.location}` : ""}
        </p>
        {event.description && (
          <p className="mt-4 font-sans text-stone-700 dark:text-stone-300">{event.description}</p>
        )}
        {event.youtubeUrl && (
          <p className="mt-4">
            <a
              href={event.youtubeUrl}
              className="font-sans text-sm text-amber-800 underline hover:text-amber-900 dark:text-amber-400"
            >
              Watch on YouTube
            </a>
          </p>
        )}
        {event.setlistTitles.length > 0 && (
          <>
            <h2 className="mt-8 font-sans text-xs uppercase tracking-[0.2em] text-amber-700 dark:text-amber-500">
              Setlist
            </h2>
            <ul className="mt-2 divide-y divide-stone-200 font-sans dark:divide-stone-800">
              {event.setlistTitles.map((title, i) => (
                <li key={i} className="py-2">
                  {title}
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
