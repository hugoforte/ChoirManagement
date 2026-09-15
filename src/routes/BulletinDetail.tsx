// The Bulletin reading view (#82): what a Chorister opens from the archive.
// Reads through getPublished, which returns null for a draft whoever is
// asking, so a Director following a stale link lands on the 404 rather than
// previewing unfinished work outside the manage route.
import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { editedAt } from "../lib/bulletin";
import { formatTimestamp } from "../lib/datetime";
import { MemberPage, usePageTitle } from "../design/MemberPage";
import { Markdown } from "../design/Markdown";
import { RemarksList } from "../components/bulletins/RemarksList";
import { cardClass, linkClass } from "../design/forms";
import NotFound from "./NotFound";

export default function BulletinDetail() {
  return <MemberPage title="Bulletins">{() => <BulletinDetailContent />}</MemberPage>;
}

function BulletinDetailContent() {
  const { bulletinId } = useParams<{ bulletinId: string }>();
  const bulletin = useQuery(api.bulletins.getPublished, { bulletinId: bulletinId as Id<"bulletins"> });
  const remarks = useQuery(api.bulletinRemarks.listPublishedForBulletin, {
    bulletinId: bulletinId as Id<"bulletins">,
  });
  usePageTitle(bulletin?.title);

  if (bulletin === null) return <NotFound />;
  if (bulletin === undefined) {
    return <p className="text-sm text-stone-500 dark:text-stone-400">Loading…</p>;
  }

  // A correction heavy enough to matter is a follow-up Bulletin, not a
  // silent edit (#49) — so the edited timestamp sits beside the published
  // one rather than replacing it.
  const edited = editedAt(bulletin);

  return (
    <article className={`${cardClass} p-6`}>
      <h1 className="text-lg font-semibold">{bulletin.title}</h1>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
        Published {formatTimestamp(bulletin.publishedAt)}
        {edited === null ? "" : ` · Edited ${formatTimestamp(edited)}`}
      </p>
      {bulletin.eventId !== null && (
        <p className="mt-2 text-sm">
          <Link to={`/events/${bulletin.eventId}`} className={linkClass}>
            {bulletin.eventTitle}
          </Link>
        </p>
      )}

      {/* The body is Markdown and must render through this component only:
          it is the one sanctioned path, and it escapes raw HTML rather than
          honouring it (see src/design/Markdown.tsx). */}
      <Markdown source={bulletin.body} className="mt-4 text-sm" />

      {/* The Remarks about Pieces this Bulletin carries (#81). Heading and
          all only when there are some, so a Bulletin with none reads as
          prose rather than as an empty section. */}
      {remarks !== undefined && remarks.length > 0 && (
        <section aria-labelledby="bulletin-remarks-heading" className="mt-6">
          <h2 id="bulletin-remarks-heading" className="text-base font-semibold">
            Remarks
          </h2>
          <div className="mt-3">
            <RemarksList remarks={remarks} />
          </div>
        </section>
      )}
    </article>
  );
}
