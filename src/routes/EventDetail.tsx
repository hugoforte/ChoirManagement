import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { can } from "../lib/roles";
import { RSVP_LABEL, RSVP_STATUSES } from "../lib/rsvp";
import { useTrackedMutation } from "../lib/useTrackedMutation";
import { OriginatingPollAvailability } from "../components/polls/OriginatingPollAvailability";
import { MemberPage, usePageTitle } from "../design/MemberPage";
import { linkClass } from "../design/forms";
import NotFound from "./NotFound";

export default function EventDetail() {
  return <MemberPage title="Events">{(viewer) => <EventDetailContent viewer={viewer} />}</MemberPage>;
}

function EventDetailContent({ viewer }: { viewer: Doc<"members"> }) {
  const { eventId } = useParams<{ eventId: string }>();
  const event = useQuery(api.events.get, { eventId: eventId as Id<"events"> });
  const { run: rsvp, pending: rsvpPending, error: rsvpError } = useTrackedMutation(api.events.rsvp);
  const roster = useQuery(api.events.roster, can(viewer, "manageEvents") ? { eventId: eventId as Id<"events"> } : "skip");
  usePageTitle(event?.title);

  if (event === null) return <NotFound />;

  return (
    <>
      {event === undefined ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">Loading…</p>
      ) : (
        <div className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900">
          <h1 className="text-lg font-semibold">{event.title}</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {new Date(event.startsAt).toLocaleString()}
            {event.location ? ` · ${event.location}` : ""}
          </p>
          {event.description && <p className="mt-4 text-sm text-stone-700 dark:text-stone-300">{event.description}</p>}
          {event.youtubeUrl && (
            <p className="mt-4">
              <a href={event.youtubeUrl} className={linkClass}>
                Watch on YouTube
              </a>
            </p>
          )}

          <div className="mt-6 flex items-center gap-2">
            <span className="text-sm font-medium">Your RSVP:</span>
            {RSVP_STATUSES.map((status) => (
              <button
                key={status}
                onClick={() => rsvp({ eventId: event._id, status })}
                disabled={rsvpPending}
                aria-pressed={event.myRsvp === status}
                className={`rounded-lg px-3 py-1 text-sm disabled:opacity-50 ${
                  event.myRsvp === status
                    ? "bg-brand-600 text-white"
                    : "border border-stone-300 text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                }`}
              >
                {RSVP_LABEL[status]}
              </button>
            ))}
          </div>
          {rsvpError && <p className="mt-2 text-sm text-danger">{rsvpError}</p>}

          {event.setlist.length > 0 && (
            <>
              <h2 className="mt-6 text-xs font-semibold tracking-wide text-stone-500 dark:text-stone-400">Setlist</h2>
              <ul className="mt-2 list-disc pl-5 text-sm">
                {event.setlist.map((piece) => (
                  <li key={piece._id}>
                    <Link to={`/library/${piece._id}`} className={linkClass}>
                      {piece.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          {roster !== undefined && (
            <>
              <h2 className="mt-6 text-xs font-semibold tracking-wide text-stone-500 dark:text-stone-400">
                Who's RSVP'd
              </h2>
              {roster.length === 0 ? (
                <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">No RSVPs yet.</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {roster.map((r) => (
                    <li key={r.memberId} className="flex items-center justify-between text-sm">
                      <span>{r.name}</span>
                      <span className="text-stone-600 dark:text-stone-400">{RSVP_LABEL[r.status]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <OriginatingPollAvailability eventId={event._id} />
        </div>
      )}
    </>
  );
}
