// The Member-facing Bulletin archive (#82): every published Bulletin,
// newest first, each linking to its reading view. Drafts never appear here
// for any Role — listPublished doesn't return them — so the Manage entry
// below is the only way into one.
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useMutation, usePaginatedQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { formatTimestamp } from "../lib/datetime";
import { can } from "../lib/roles";
import { EmailPreference } from "../components/bulletins/EmailPreference";
import { MemberPage } from "../design/MemberPage";
import { cardClass, linkClass, mutedLinkClass } from "../design/forms";

// The archive is the one list in the app that only grows, so it pages
// rather than loading whole. A screen's worth at a time; a choir posting
// weekly gets five months in the first page.
const PAGE_SIZE = 20;

export default function Bulletins() {
  return <MemberPage title="Bulletins">{(viewer) => <BulletinsContent viewer={viewer} />}</MemberPage>;
}

function BulletinsContent({ viewer }: { viewer: Doc<"members"> }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.bulletins.listPublished,
    {},
    { initialNumItems: PAGE_SIZE },
  );
  const markBulletinsRead = useMutation(api.bulletins.markBulletinsRead);

  // Opening the list is what clears the nav's unread indicator (#49). Once,
  // on mount: the marker records that this Member looked, so it must not
  // re-fire as later pages load. The timestamp itself is the server's, since
  // it is compared against a server-stamped publishedAt.
  useEffect(() => {
    void markBulletinsRead({});
  }, [markBulletinsRead]);

  return (
    <>
      {can(viewer, "manageBulletins") && (
        <Link to="/bulletins/manage" className={`mb-4 inline-block ${linkClass}`}>
          Manage
        </Link>
      )}

      {status === "LoadingFirstPage" ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">Loading…</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">No Bulletins yet.</p>
      ) : (
        <ul className="space-y-3">
          {results.map((bulletin) => (
            <li key={bulletin._id} className={`${cardClass} p-3`}>
              <Link to={`/bulletins/${bulletin._id}`} className="font-medium hover:underline">
                {bulletin.title}
              </Link>
              <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                {formatTimestamp(bulletin.publishedAt)}
                {bulletin.eventTitle === null ? "" : ` · ${bulletin.eventTitle}`}
              </p>
            </li>
          ))}
        </ul>
      )}

      {status === "CanLoadMore" && (
        <button onClick={() => loadMore(PAGE_SIZE)} className={`mt-4 ${mutedLinkClass}`}>
          Load more
        </button>
      )}

      {/* Absent means opted in, matching how the send reads it (#52). */}
      <EmailPreference enabled={viewer.emailBulletins !== false} />
    </>
  );
}
