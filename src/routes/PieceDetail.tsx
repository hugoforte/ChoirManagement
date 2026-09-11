import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { MemberGate } from "../lib/memberGate";
import NotFound from "./NotFound";

export default function PieceDetail() {
  return <MemberGate>{() => <PieceDetailContent />}</MemberGate>;
}

function PieceDetailContent() {
  const { pieceId } = useParams<{ pieceId: string }>();
  const piece = useQuery(api.pieces.get, { pieceId: pieceId as Id<"pieces"> });

  if (piece === undefined) return <p className="p-8 text-gray-500">Loading…</p>;
  if (piece === null) return <NotFound />;

  const byline = [piece.composer, piece.arranger && `arr. ${piece.arranger}`].filter(Boolean).join(" — ");

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">{piece.title}</h1>
      {byline && <p className="mt-1 text-gray-600">{byline}</p>}
      {piece.notes && <p className="mt-4">{piece.notes}</p>}
      {piece.youtubeUrl && (
        <p className="mt-4">
          <a href={piece.youtubeUrl} className="text-brand-600 underline hover:text-brand-700">
            Reference recording (YouTube)
          </a>
        </p>
      )}

      <h2 className="mt-6 font-semibold">Files</h2>
      {piece.files.length === 0 ? (
        <p className="mt-2 text-gray-500">No files attached.</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {piece.files.map((file) => (
            <li key={file.storageId}>
              <p className="text-sm font-medium">
                {file.filename} <span className="text-gray-500">({file.kind})</span>
              </p>
              {/* Browser-native preview only — no in-app score reader/viewer,
                  per the Newzik-parity north star being out of scope for v1. */}
              {file.url && file.kind === "pdf" && (
                <iframe src={file.url} className="mt-1 h-64 w-full rounded border" title={file.filename} />
              )}
              {file.url && file.kind === "audio" && (
                <audio controls src={file.url} className="mt-1 w-full" />
              )}
              {file.url && file.kind !== "pdf" && file.kind !== "audio" && (
                <a href={file.url} className="text-sm text-brand-600 underline hover:text-brand-700">
                  Download {file.filename}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      <nav className="mt-8">
        <Link to="/library" className="text-sm text-gray-600 underline">
          Back to Music Library
        </Link>
      </nav>
    </div>
  );
}
