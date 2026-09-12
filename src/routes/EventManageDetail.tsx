import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { MemberGate, canManage } from "../lib/memberGate";
import NotFound from "./NotFound";

function toDatetimeLocal(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EventManageDetail() {
  return (
    <MemberGate>
      {(viewer) =>
        canManage(viewer) ? (
          <EventManageDetailContent />
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

function EventManageDetailContent() {
  const { eventId } = useParams<{ eventId: string }>();
  const id = eventId as Id<"events">;
  const event = useQuery(api.events.get, { eventId: id });
  const pieces = useQuery(api.pieces.list);
  const updateEvent = useMutation(api.events.update);

  const [fields, setFields] = useState({
    title: "",
    description: "",
    startsAt: toDatetimeLocal(Date.now()),
    location: "",
    youtubeUrl: "",
    visibility: "private" as "public" | "private",
  });
  const [setlist, setSetlist] = useState<Id<"pieces">[]>([]);
  const [addPieceId, setAddPieceId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!event) return;
    setFields({
      title: event.title,
      description: event.description ?? "",
      startsAt: toDatetimeLocal(event.startsAt),
      location: event.location ?? "",
      youtubeUrl: event.youtubeUrl ?? "",
      visibility: event.visibility,
    });
    setSetlist(event.setlist.map((p) => p._id));
    // Only re-sync when a different Event loads, not on every field change.
  }, [event === undefined ? undefined : event._id]);

  if (event === undefined) return <p className="p-8 text-gray-500">Loading…</p>;
  if (event === null) return <NotFound />;

  const pieceTitleById = new Map(pieces?.map((p) => [p._id, p.title]));
  const availablePieces = (pieces ?? []).filter((p) => !setlist.includes(p._id));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateEvent({
        eventId: id,
        title: fields.title,
        description: fields.description || undefined,
        startsAt: new Date(fields.startsAt).getTime(),
        location: fields.location || undefined,
        youtubeUrl: fields.youtubeUrl || undefined,
        setlist,
        visibility: fields.visibility,
      });
    } finally {
      setSaving(false);
    }
  }

  function moveSetlistItem(index: number, direction: -1 | 1) {
    const next = [...setlist];
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= next.length) return;
    [next[index], next[swapWith]] = [next[swapWith], next[index]];
    setSetlist(next);
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">Edit Event</h1>

      <form onSubmit={handleSave} className="mt-4 space-y-3">
        <div>
          <label htmlFor="event-title" className="text-sm font-medium">
            Title
          </label>
          <input
            id="event-title"
            type="text"
            value={fields.title}
            onChange={(e) => setFields((f) => ({ ...f, title: e.target.value }))}
            required
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label htmlFor="event-description" className="text-sm font-medium">
            Description
          </label>
          <textarea
            id="event-description"
            value={fields.description}
            onChange={(e) => setFields((f) => ({ ...f, description: e.target.value }))}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label htmlFor="event-starts-at" className="text-sm font-medium">
            Date and time
          </label>
          <input
            id="event-starts-at"
            type="datetime-local"
            value={fields.startsAt}
            onChange={(e) => setFields((f) => ({ ...f, startsAt: e.target.value }))}
            required
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label htmlFor="event-location" className="text-sm font-medium">
            Location
          </label>
          <input
            id="event-location"
            type="text"
            value={fields.location}
            onChange={(e) => setFields((f) => ({ ...f, location: e.target.value }))}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label htmlFor="event-youtube" className="text-sm font-medium">
            YouTube link
          </label>
          <input
            id="event-youtube"
            type="text"
            value={fields.youtubeUrl}
            onChange={(e) => setFields((f) => ({ ...f, youtubeUrl: e.target.value }))}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label htmlFor="event-visibility" className="text-sm font-medium">
            Visibility
          </label>
          <select
            id="event-visibility"
            value={fields.visibility}
            onChange={(e) => setFields((f) => ({ ...f, visibility: e.target.value as "public" | "private" }))}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="private">Private</option>
            <option value="public">Public</option>
          </select>
        </div>

        <div className="border-t border-gray-100 pt-3">
          <p className="text-sm font-medium">Setlist</p>
          {setlist.length === 0 ? (
            <p className="mt-1 text-sm text-gray-500">No Pieces added yet.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {setlist.map((pieceId, i) => (
                <li key={pieceId} className="flex items-center justify-between text-sm">
                  <span>{pieceTitleById.get(pieceId) ?? "Untitled"}</span>
                  <span className="flex gap-2">
                    <button type="button" onClick={() => moveSetlistItem(i, -1)} disabled={i === 0}>
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSetlistItem(i, 1)}
                      disabled={i === setlist.length - 1}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => setSetlist(setlist.filter((id) => id !== pieceId))}
                      className="text-danger hover:underline"
                    >
                      Remove
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex gap-2">
            <select
              value={addPieceId}
              onChange={(e) => setAddPieceId(e.target.value)}
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="">Add a Piece…</option>
              {availablePieces.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!addPieceId}
              onClick={() => {
                setSetlist([...setlist, addPieceId as Id<"pieces">]);
                setAddPieceId("");
              }}
              className="rounded bg-brand-600 px-3 py-1 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving || !fields.title.trim()}
          className="rounded bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Save
        </button>
      </form>

      <nav className="mt-8">
        <Link to="/events/manage" className="text-sm text-gray-600 underline">
          Back to Manage Events
        </Link>
      </nav>
    </div>
  );
}
