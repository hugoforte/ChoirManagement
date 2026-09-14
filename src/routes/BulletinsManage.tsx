// Authoring home for Bulletins (#80): compose a draft, see what is and
// isn't out yet, and delete. Editing, publishing and the Markdown preview
// live one level down in BulletinManageDetail, the same split as
// EventsManage / EventManageDetail. Remarks arrive with #81 and Share Links
// with #83.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { useTrackedMutation } from "../lib/useTrackedMutation";
import { editedAt } from "../lib/bulletin";
import { formatTimestamp } from "../lib/datetime";
import { can } from "../lib/roles";
import { MemberPage } from "../design/MemberPage";
import { inputClass, primaryButtonClass, dangerLinkClass, cardClass } from "../design/forms";

type BulletinRow = Doc<"bulletins"> & { eventTitle: string | null };

export default function BulletinsManage() {
  return (
    <MemberPage
      title="Manage Bulletins"
      require="manageBulletins"
      backTo={{ to: "/bulletins", label: "Back to Bulletins" }}
    >
      {(viewer) => <BulletinsManageContent viewer={viewer} />}
    </MemberPage>
  );
}

function BulletinsManageContent({ viewer }: { viewer: Doc<"members"> }) {
  const bulletins = useQuery(api.bulletins.listAll, {});
  const { run: createBulletin, pending: creating, error: createError } = useTrackedMutation(
    api.bulletins.createDraft,
  );
  const { run: removeBulletin, error: removeError } = useTrackedMutation(api.bulletins.remove);

  const [newTitle, setNewTitle] = useState("");

  const error = createError ?? removeError;
  // Only an Admin may delete a Bulletin that is already out (#49) — the
  // control is absent rather than disabled, so a Director isn't invited to
  // click something that will refuse them.
  const mayDeletePublished = can(viewer, "deletePublishedBulletins");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const id = await createBulletin({ title: newTitle.trim() });
    if (id !== undefined) setNewTitle("");
  }

  async function handleDelete(bulletin: BulletinRow) {
    const warning =
      bulletin.status === "published"
        ? `Delete "${bulletin.title}"? It is already published and this can't be undone.`
        : `Delete the draft "${bulletin.title}"?`;
    if (!confirm(warning)) return;
    await removeBulletin({ bulletinId: bulletin._id });
  }

  const drafts = bulletins?.filter((b) => b.status === "draft") ?? [];
  const published = bulletins?.filter((b) => b.status === "published") ?? [];

  return (
    <>
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New Bulletin title"
          className={`${inputClass} flex-1`}
        />
        <button type="submit" disabled={creating || !newTitle.trim()} className={primaryButtonClass}>
          Add
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {bulletins === undefined ? (
        <p className="mt-4 text-sm text-stone-500 dark:text-stone-400">Loading…</p>
      ) : (
        <>
          <BulletinSection
            heading="Drafts"
            emptyMessage="No drafts."
            bulletins={drafts}
            onDelete={handleDelete}
            mayDelete
          />
          <BulletinSection
            heading="Published"
            emptyMessage="Nothing published yet."
            bulletins={published}
            onDelete={handleDelete}
            mayDelete={mayDeletePublished}
          />
        </>
      )}
    </>
  );
}

function BulletinSection({
  heading,
  emptyMessage,
  bulletins,
  onDelete,
  mayDelete,
}: {
  heading: string;
  emptyMessage: string;
  bulletins: BulletinRow[];
  onDelete: (bulletin: BulletinRow) => void;
  mayDelete: boolean;
}) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold text-stone-700 dark:text-stone-300">{heading}</h2>
      {bulletins.length === 0 ? (
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">{emptyMessage}</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {bulletins.map((bulletin) => (
            <li key={bulletin._id} className={`${cardClass} p-3`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Link to={`/bulletins/manage/${bulletin._id}`} className="font-medium hover:underline">
                    {bulletin.title}
                  </Link>
                  <div className="text-sm text-stone-500 dark:text-stone-400">
                    <BulletinMeta bulletin={bulletin} />
                  </div>
                </div>
                {mayDelete && (
                  <button onClick={() => onDelete(bulletin)} className={dangerLinkClass}>
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BulletinMeta({ bulletin }: { bulletin: BulletinRow }) {
  const edited = editedAt(bulletin);
  const parts = [
    bulletin.publishedAt === undefined
      ? "Draft"
      : `Published ${formatTimestamp(bulletin.publishedAt)}`,
    ...(edited === null ? [] : [`Edited ${formatTimestamp(edited)}`]),
    ...(bulletin.eventTitle === null ? [] : [bulletin.eventTitle]),
  ];
  return <>{parts.join(" · ")}</>;
}
