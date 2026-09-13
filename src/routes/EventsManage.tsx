import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { MemberPage } from "../design/MemberPage";
import { inputClass, primaryButtonClass, dangerLinkClass, cardClass } from "../design/forms";

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time, not the UTC ISO
// string Date#toISOString gives — build it from local getters instead.
function toDatetimeLocal(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EventsManage() {
  return (
    <MemberPage title="Manage Events" require="manageEvents" backTo={{ to: "/events", label: "Back to Events" }}>
      {() => <EventsManageContent />}
    </MemberPage>
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
    <>
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New Event title"
          className={`${inputClass} flex-1`}
        />
        <button type="submit" disabled={creating || !newTitle.trim()} className={primaryButtonClass}>
          Add
        </button>
      </form>

      {events === undefined ? (
        <p className="mt-4 text-sm text-stone-500 dark:text-stone-400">Loading…</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {events.map((event) => (
            <li key={event._id} className={`${cardClass} p-3`}>
              <div className="flex items-center justify-between">
                <div>
                  <Link to={`/events/manage/${event._id}`} className="font-medium hover:underline">
                    {event.title}
                  </Link>
                  <div className="text-sm text-stone-500 dark:text-stone-400">
                    {toDatetimeLocal(event.startsAt).replace("T", " ")}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <button
                    onClick={() => handleToggleVisibility(event)}
                    className="capitalize text-stone-600 underline hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
                  >
                    {event.visibility}
                  </button>
                  <button
                    onClick={() => duplicateEvent({ eventId: event._id })}
                    className="text-stone-600 underline hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
                  >
                    Duplicate
                  </button>
                  <button onClick={() => handleDelete(event)} className={dangerLinkClass}>
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
