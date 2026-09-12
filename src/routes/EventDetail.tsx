import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { MemberGate, canManage } from "../lib/memberGate";
import NotFound from "./NotFound";

const RSVP_OPTIONS = ["yes", "no", "maybe"] as const;

export default function EventDetail() {
  return <MemberGate>{(viewer) => <EventDetailContent viewer={viewer} />}</MemberGate>;
}

function EventDetailContent({ viewer }: { viewer: Doc<"members"> }) {
  const { eventId } = useParams<{ eventId: string }>();
  const event = useQuery(api.events.get, { eventId: eventId as Id<"events"> });
  const rsvp = useMutation(api.events.rsvp);
  const roster = useQuery(api.events.roster, canManage(viewer) ? { eventId: eventId as Id<"events"> } : "skip");

  if (event === undefined) return <p className="p-8 text-gray-500">Loading…</p>;
  if (event === null) return <NotFound />;

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
          <a href={event.youtubeUrl} className="text-brand-600 underline hover:text-brand-700">
            Watch on YouTube
          </a>
        </p>
      )}

      <div className="mt-6 flex items-center gap-2">
        <span className="text-sm font-medium">Your RSVP:</span>
        {RSVP_OPTIONS.map((status) => (
          <button
            key={status}
            onClick={() => rsvp({ eventId: event._id, status })}
            className={`rounded px-3 py-1 text-sm capitalize ${
              event.myRsvp === status
                ? "bg-brand-600 text-white"
                : "border border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {event.setlist.length > 0 && (
        <>
          <h2 className="mt-6 font-semibold">Setlist</h2>
          <ul className="mt-2 list-disc pl-5">
            {event.setlist.map((piece) => (
              <li key={piece._id}>
                <Link to={`/library/${piece._id}`} className="text-brand-600 underline hover:text-brand-700">
                  {piece.title}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {roster !== undefined && (
        <>
          <h2 className="mt-6 font-semibold">Who's RSVP'd</h2>
          {roster.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No RSVPs yet.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {roster.map((r) => (
                <li key={r.memberId} className="flex items-center justify-between text-sm">
                  <span>{r.name}</span>
                  <span className="capitalize text-gray-600">{r.status}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <nav className="mt-8">
        <Link to="/events" className="text-sm text-gray-600 underline">
          Back to Events
        </Link>
      </nav>
    </div>
  );
}
