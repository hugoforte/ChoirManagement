import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { MemberGate, canManage } from "../lib/memberGate";

type FileKind = "pdf" | "musescore" | "midi" | "audio" | "other";

function inferKind(filename: string): FileKind {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "mscz" || ext === "mscx") return "musescore";
  if (ext === "mid" || ext === "midi") return "midi";
  if (["mp3", "wav", "m4a", "ogg", "flac"].includes(ext ?? "")) return "audio";
  return "other";
}

export default function LibraryManage() {
  return (
    <MemberGate>
      {(viewer) =>
        canManage(viewer) ? (
          <LibraryManageContent />
        ) : (
          <div className="mx-auto max-w-2xl p-8">
            <p>You don't have access to this page.</p>
            <Link to="/library" className="text-brand-600 underline hover:text-brand-700">
              Back to Music Library
            </Link>
          </div>
        )
      }
    </MemberGate>
  );
}

function LibraryManageContent() {
  const pieces = useQuery(api.pieces.list);
  const createPiece = useMutation(api.pieces.create);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await createPiece({ title: newTitle.trim() });
      setNewTitle("");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">Manage Music Library</h1>

      <form onSubmit={handleCreate} className="mt-4 flex gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New Piece title"
          className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={creating || !newTitle.trim()}
          className="rounded bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {pieces === undefined ? (
        <p className="mt-4 text-gray-500">Loading…</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {pieces.map((piece) => (
            <PieceManageRow key={piece._id} piece={piece} />
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

function PieceManageRow({ piece }: { piece: Doc<"pieces"> }) {
  const [expanded, setExpanded] = useState(false);
  const updatePiece = useMutation(api.pieces.update);
  const removePiece = useMutation(api.pieces.remove);
  const generateUploadUrl = useMutation(api.pieces.generateUploadUrl);
  const attachFile = useMutation(api.pieces.attachFile);
  const detachFile = useMutation(api.pieces.detachFile);
  const detail = useQuery(api.pieces.get, expanded ? { pieceId: piece._id } : "skip");

  const [fields, setFields] = useState({
    title: piece.title,
    composer: piece.composer ?? "",
    arranger: piece.arranger ?? "",
    notes: piece.notes ?? "",
    youtubeUrl: piece.youtubeUrl ?? "",
  });
  const [uploading, setUploading] = useState(false);

  async function handleSave() {
    await updatePiece({
      pieceId: piece._id,
      title: fields.title,
      composer: fields.composer || undefined,
      arranger: fields.arranger || undefined,
      notes: fields.notes || undefined,
      youtubeUrl: fields.youtubeUrl || undefined,
    });
  }

  async function handleDelete() {
    if (!confirm(`Delete "${piece.title}"? This also deletes its attached files.`)) return;
    await removePiece({ pieceId: piece._id });
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await attachFile({ pieceId: piece._id, storageId, filename: file.name, kind: inferKind(file.name) });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <li className="rounded border border-gray-200 p-3">
      <div className="flex items-center justify-between">
        <button onClick={() => setExpanded((v) => !v)} className="font-medium hover:underline">
          {piece.title}
        </button>
        <button onClick={handleDelete} className="text-sm text-danger hover:underline">
          Delete
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2">
          <input
            type="text"
            value={fields.title}
            onChange={(e) => setFields((f) => ({ ...f, title: e.target.value }))}
            placeholder="Title"
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <input
            type="text"
            value={fields.composer}
            onChange={(e) => setFields((f) => ({ ...f, composer: e.target.value }))}
            placeholder="Composer"
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <input
            type="text"
            value={fields.arranger}
            onChange={(e) => setFields((f) => ({ ...f, arranger: e.target.value }))}
            placeholder="Arranger"
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <textarea
            value={fields.notes}
            onChange={(e) => setFields((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Notes"
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <input
            type="text"
            value={fields.youtubeUrl}
            onChange={(e) => setFields((f) => ({ ...f, youtubeUrl: e.target.value }))}
            placeholder="YouTube reference link"
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <button
            onClick={handleSave}
            className="rounded bg-brand-600 px-3 py-1 text-sm text-white hover:bg-brand-700"
          >
            Save
          </button>

          <div className="mt-3 border-t border-gray-100 pt-3">
            <p className="text-sm font-medium">Files</p>
            {detail === undefined ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {detail?.files.map((file) => (
                  <li key={file.storageId} className="flex items-center justify-between text-sm">
                    <span>
                      {file.filename} <span className="text-gray-500">({file.kind})</span>
                    </span>
                    <button
                      onClick={() => detachFile({ pieceId: piece._id, storageId: file.storageId })}
                      className="text-danger hover:underline"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input type="file" onChange={handleFileUpload} disabled={uploading} className="mt-2 text-sm" />
          </div>
        </div>
      )}
    </li>
  );
}
