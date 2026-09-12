import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { MemberGate, canManage } from "../lib/memberGate";

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time, not the UTC ISO
// string Date#toISOString gives — build it from local getters instead.
function toDatetimeLocal(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EventsManage() {
  return (
    <MemberGate>
      {(viewer) =>
        canManage(viewer) ? (
          <EventsManageContent />
        ) : (
          <div className="mx-auto max-w-2xl p-8">
            <p>You don't have access to this page.</p>
            <Link to="/events" className="text-brand-600 underline hover:text-brand-700">
              Back to Events
            </Link>
          </div>
        )
      }
    </MemberGate>
  );
}

function EventsManageContent() {
  const now = useMemo(() => Date.now(), []);
  const events = useQuery(api.events.list, { now });
  const createEvent = useMutation(api.events.create);
  const removeEvent = useMutation(api.events.remove);
  const duplicateEvent = useMutation(api.events.duplicate);
  const updateEvent = useMutation(api.events.update);

  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await createEvent({
        title: newTitle.trim(),
        description: undefined,
        startsAt: now,
        location: undefined,
        youtubeUrl: undefined,
        setlist: [],
        visibility: "private",
      });
      setNewTitle("");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(event: Doc<"events">) {
    if (!confirm(`Delete "${event.title}"? This also deletes its RSVPs.`)) return;
    await removeEvent({ eventId: event._id });
  }

  async function handleToggleVisibility(event: Doc<"events">) {
    await updateEvent({
      eventId: event._id,
      title: event.title,
      description: event.description,
      startsAt: event.startsAt,
      location: event.location,
      youtubeUrl: event.youtubeUrl,
      setlist: event.setlist,
      visibility: event.visibility === "public" ? "private" : "public",
    });
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">Manage Events</h1>

      <form onSubmit={handleCreate} className="mt-4 flex gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New Event title"
          className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={creating || !newTitle.trim()}
          className="rounded bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {events === undefined ? (
        <p className="mt-4 text-gray-500">Loading…</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {events.map((event) => (
            <li key={event._id} className="rounded border border-gray-200 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <Link
                    to={`/events/manage/${event._id}`}
                    className="font-medium text-brand-600 underline hover:text-brand-700"
                  >
                    {event.title}
                  </Link>
                  <div className="text-sm text-gray-600">{toDatetimeLocal(event.startsAt).replace("T", " ")}</div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <button
                    onClick={() => handleToggleVisibility(event)}
                    className="capitalize text-gray-700 underline hover:text-gray-900"
                  >
                    {event.visibility}
                  </button>
                  <button
                    onClick={() => duplicateEvent({ eventId: event._id })}
                    className="text-gray-700 underline hover:text-gray-900"
                  >
                    Duplicate
                  </button>
                  <button onClick={() => handleDelete(event)} className="text-danger hover:underline">
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <nav className="mt-8">
        <Link to="/events" className="text-sm text-gray-600 underline">
          Back to Events
        </Link>
      </nav>
    </div>
  );
}
