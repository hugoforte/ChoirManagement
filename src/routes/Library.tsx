import { Link } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { canManage } from "../lib/roles";
import { MemberPage } from "../design/MemberPage";
import { linkClass } from "../design/forms";

export default function Library() {
  return <MemberPage title="Music Library">{(viewer) => <LibraryContent viewer={viewer} />}</MemberPage>;
}

function LibraryContent({ viewer }: { viewer: Doc<"members"> }) {
  const pieces = useQuery(api.pieces.list);

  return (
    <>
      {canManage(viewer) && (
        <Link to="/library/manage" className={`mb-4 inline-block ${linkClass}`}>
          Manage
        </Link>
      )}

      {pieces === undefined ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">Loading…</p>
      ) : pieces.length === 0 ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">No Pieces yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {pieces.map((piece) => (
              <li key={piece._id} className="px-4 py-3">
                <Link to={`/library/${piece._id}`} className="text-sm font-medium hover:underline">
                  {piece.title}
                </Link>
                {piece.composer && (
                  <span className="ml-2 text-xs text-stone-500 dark:text-stone-400">{piece.composer}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
