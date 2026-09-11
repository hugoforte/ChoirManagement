import { Link } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { MemberGate, canManage } from "../lib/memberGate";

export default function Library() {
  return <MemberGate>{(viewer) => <LibraryContent viewer={viewer} />}</MemberGate>;
}

function LibraryContent({ viewer }: { viewer: Doc<"members"> }) {
  const pieces = useQuery(api.pieces.list);

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Music Library</h1>
        {canManage(viewer) && (
          <Link to="/library/manage" className="text-sm text-brand-600 underline hover:text-brand-700">
            Manage
          </Link>
        )}
      </div>

      {pieces === undefined ? (
        <p className="mt-4 text-gray-500">Loading…</p>
      ) : pieces.length === 0 ? (
        <p className="mt-4 text-gray-500">No Pieces yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {pieces.map((piece) => (
            <li key={piece._id}>
              <Link
                to={`/library/${piece._id}`}
                className="font-medium text-brand-600 underline hover:text-brand-700"
              >
                {piece.title}
              </Link>
              {piece.composer && <span className="ml-2 text-sm text-gray-600">{piece.composer}</span>}
            </li>
          ))}
        </ul>
      )}

      <nav className="mt-8">
        <Link to="/" className="text-sm text-gray-600 underline">
          Back to dashboard
        </Link>
      </nav>
    </div>
  );
}
