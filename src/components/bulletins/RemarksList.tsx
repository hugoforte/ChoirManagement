// Read-only rendering of a Bulletin's Remarks (#81). Used by the manage
// editor's preview and, once #82 lands, by the Member-facing reading view —
// so it takes plain rows rather than a bulletinId, and renders no heading
// or empty state of its own: each caller words those for its own page.
import { Link } from "react-router-dom";

import type { Id } from "../../../convex/_generated/dataModel";
import { linkClass } from "../../design/forms";

export type RemarkListItem = {
  _id: Id<"bulletinRemarks">;
  pieceId: Id<"pieces">;
  pieceTitle: string;
  text: string;
};

export function RemarksList({ remarks }: { remarks: RemarkListItem[] }) {
  if (remarks.length === 0) return null;

  return (
    <ul className="space-y-3">
      {remarks.map((remark) => (
        <li key={remark._id}>
          {/* The link is the point of modelling a Remark against a Piece:
              a chorister reading it can open the music straight away. */}
          <Link to={`/library/${remark.pieceId}`} className={linkClass}>
            {remark.pieceTitle}
          </Link>
          {remark.text.trim() !== "" && (
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-stone-700 dark:text-stone-300">
              {remark.text}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
