import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { MemberGate, isAdmin } from "../lib/memberGate";
import { AppShell } from "../design/AppShell";
import { linkClass } from "../design/forms";
import NotFound from "./NotFound";

export default function PieceDetail() {
  return <MemberGate>{(viewer) => <PieceDetailContent viewer={viewer} />}</MemberGate>;
}

function PieceDetailContent({ viewer }: { viewer: Doc<"members"> }) {
  const choirSettings = useQuery(api.choirSettings.get);
  const { pieceId } = useParams<{ pieceId: string }>();
  const piece = useQuery(api.pieces.get, { pieceId: pieceId as Id<"pieces"> });

  if (piece === null) return <NotFound />;

  const byline = piece
    ? [piece.composer, piece.arranger && `arr. ${piece.arranger}`].filter(Boolean).join(" — ")
    : "";

  return (
    <AppShell
      choirName={choirSettings?.name ?? "ChoirManagement"}
      viewerName={viewer.name}
      showSettings={isAdmin(viewer)}
      pageTitle={piece?.title ?? "Music Library"}
    >
      {piece === undefined ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">Loading…</p>
      ) : (
        <div className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900">
          <h1 className="text-lg font-semibold">{piece.title}</h1>
          {byline && <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{byline}</p>}
          {piece.notes && <p className="mt-4 text-sm text-stone-700 dark:text-stone-300">{piece.notes}</p>}
          {piece.youtubeUrl && (
            <p className="mt-4">
              <a href={piece.youtubeUrl} className={linkClass}>
                Reference recording (YouTube)
              </a>
            </p>
          )}

          <h2 className="mt-6 text-xs font-semibold tracking-wide text-stone-500 dark:text-stone-400">Files</h2>
          {piece.files.length === 0 ? (
            <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">No files attached.</p>
          ) : (
            <ul className="mt-2 space-y-3">
              {piece.files.map((file) => (
                <li key={file.storageId}>
                  <p className="text-sm font-medium">
                    {file.filename} <span className="text-stone-500 dark:text-stone-400">({file.kind})</span>
                  </p>
                  {/* Browser-native preview only — no in-app score reader/viewer,
                      per the Newzik-parity north star being out of scope for v1. */}
                  {file.url && file.kind === "pdf" && (
                    <iframe
                      src={file.url}
                      className="mt-1 h-64 w-full rounded-lg border border-stone-200 dark:border-stone-700"
                      title={file.filename}
                    />
                  )}
                  {file.url && file.kind === "audio" && <audio controls src={file.url} className="mt-1 w-full" />}
                  {file.url && file.kind !== "pdf" && file.kind !== "audio" && (
                    <a href={file.url} className={linkClass}>
                      Download {file.filename}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </AppShell>
  );
}
