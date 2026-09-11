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
      <div className="mx-auto max-w-2xl p-8">
        <p>This Event is private.</p>
        <Link to="/sign-in" className="underline">
          Sign in to view it
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">{event.title}</h1>
      <p className="mt-1 text-gray-600">
        {new Date(event.startsAt).toLocaleString()}
        {event.location ? ` — ${event.location}` : ""}
      </p>
      {event.description && <p className="mt-4">{event.description}</p>}
      {event.youtubeUrl && (
        <p className="mt-4">
          <a href={event.youtubeUrl} className="underline">
            Watch on YouTube
          </a>
        </p>
      )}
      {event.setlistTitles.length > 0 && (
        <>
          <h2 className="mt-6 font-semibold">Setlist</h2>
          <ul className="mt-2 list-disc pl-5">
            {event.setlistTitles.map((title, i) => (
              <li key={i}>{title}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
