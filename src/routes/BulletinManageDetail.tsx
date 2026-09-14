// The Bulletin compose/edit form (#80): title, Markdown body, optional
// Event anchor, and the one-way publish action. Mirrors
// EventManageDetail's shape — a MemberPage gate wrapping a form that
// re-syncs from the query only when a different document loads.
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useTrackedMutation } from "../lib/useTrackedMutation";
import { editedAt } from "../lib/bulletin";
import { formatTimestamp } from "../lib/datetime";
import { ShareLinkPanel } from "../components/bulletins/ShareLinkPanel";
import { Markdown } from "../design/Markdown";
import { MemberPage, usePageTitle } from "../design/MemberPage";
import { inputClass, labelClass, primaryButtonClass } from "../design/forms";
import NotFound from "./NotFound";

export default function BulletinManageDetail() {
  return (
    <MemberPage
      title="Edit Bulletin"
      require="manageBulletins"
      backTo={{ to: "/bulletins", label: "Back to Bulletins" }}
    >
      {() => <BulletinManageDetailContent />}
    </MemberPage>
  );
}

const NO_EVENT = "";

function BulletinManageDetailContent() {
  const { bulletinId } = useParams<{ bulletinId: string }>();
  const id = bulletinId as Id<"bulletins">;
  const now = useMemo(() => Date.now(), []);
  const bulletin = useQuery(api.bulletins.get, { bulletinId: id });
  // The anchor picker offers every Event, past ones included: a Bulletin is
  // usually written about the rehearsal that just happened.
  const events = useQuery(api.events.list, { now });
  const { run: updateBulletin, pending: saving, error: saveError } = useTrackedMutation(api.bulletins.update);
  const { run: publishBulletin, pending: publishing, error: publishError } = useTrackedMutation(
    api.bulletins.publish,
  );

  const [fields, setFields] = useState({ title: "", body: "", eventId: NO_EVENT });

  usePageTitle(bulletin?.title);

  useEffect(() => {
    if (!bulletin) return;
    setFields({
      title: bulletin.title,
      body: bulletin.body,
      eventId: bulletin.eventId ?? NO_EVENT,
    });
    // Re-sync only when a different Bulletin loads, not on every keystroke —
    // see EventManageDetail for why this reads `bulletin ? bulletin._id : undefined`.
  }, [bulletin ? bulletin._id : undefined]);

  if (bulletin === null) return <NotFound />;

  const error = saveError ?? publishError;
  const edited = bulletin ? editedAt(bulletin) : null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await updateBulletin({
      bulletinId: id,
      title: fields.title,
      body: fields.body,
      // null clears the anchor; an undefined would be dropped on the wire
      // and read as "leave it alone".
      eventId: fields.eventId === NO_EVENT ? null : (fields.eventId as Id<"events">),
    });
  }

  return (
    <>
      {bulletin === undefined ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">Loading…</p>
      ) : (
        <div className="max-w-xl space-y-3">
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {bulletin.publishedAt === undefined
              ? "Draft — only Members who manage Bulletins can see this."
              : `Published ${formatTimestamp(bulletin.publishedAt)}`}
            {edited !== null && ` · Edited ${formatTimestamp(edited)}`}
          </p>

          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label htmlFor="bulletin-title" className={labelClass}>
                Title
              </label>
              <input
                id="bulletin-title"
                type="text"
                value={fields.title}
                onChange={(e) => setFields((f) => ({ ...f, title: e.target.value }))}
                required
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div>
              <label htmlFor="bulletin-body" className={labelClass}>
                Body
              </label>
              <textarea
                id="bulletin-body"
                value={fields.body}
                onChange={(e) => setFields((f) => ({ ...f, body: e.target.value }))}
                rows={12}
                className={`mt-1 font-mono ${inputClass}`}
              />
              <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                Markdown. HTML tags are shown as text, not rendered.
              </p>
            </div>
            <div>
              <label htmlFor="bulletin-event" className={labelClass}>
                Event
              </label>
              <select
                id="bulletin-event"
                value={fields.eventId}
                onChange={(e) => setFields((f) => ({ ...f, eventId: e.target.value }))}
                className={`mt-1 ${inputClass}`}
              >
                <option value={NO_EVENT}>No Event</option>
                {(events ?? []).map((event) => (
                  <option key={event._id} value={event._id}>
                    {event.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <button type="submit" disabled={saving || !fields.title.trim()} className={primaryButtonClass}>
                Save
              </button>
              {bulletin.status === "draft" && (
                <button
                  type="button"
                  onClick={() => publishBulletin({ bulletinId: id })}
                  disabled={publishing}
                  className={primaryButtonClass}
                >
                  Publish
                </button>
              )}
            </div>
            {bulletin.status === "draft" && (
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Publishing is permanent — there is no un-publish. Save first; publishing doesn't save the
                form.
              </p>
            )}
            {error && <p className="text-sm text-danger">{error}</p>}
          </form>

          <section className="border-t border-stone-200 pt-3 dark:border-stone-800">
            <h2 className={labelClass}>Preview</h2>
            <Markdown source={fields.body} className="mt-2 text-sm text-stone-700 dark:text-stone-300" />
          </section>

          <ShareLinkPanel bulletinId={id} published={bulletin.status === "published"} />
        </div>
      )}
    </>
  );
}
