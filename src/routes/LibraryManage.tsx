import { useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { canManage } from "../lib/roles";
import { MemberPage } from "../design/MemberPage";
import { inputClass, primaryButtonClass, dangerLinkClass, cardClass } from "../design/forms";

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
    <MemberPage
      title="Manage Music Library"
      require={canManage}
      backTo={{ to: "/library", label: "Back to Music Library" }}
    >
      {() => <LibraryManageContent />}
    </MemberPage>
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
    <>
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New Piece title"
          className={`${inputClass} flex-1`}
        />
        <button type="submit" disabled={creating || !newTitle.trim()} className={primaryButtonClass}>
          Add
        </button>
      </form>

      {pieces === undefined ? (
        <p className="mt-4 text-sm text-stone-500 dark:text-stone-400">Loading…</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {pieces.map((piece) => (
            <PieceManageRow key={piece._id} piece={piece} />
          ))}
        </ul>
      )}
    </>
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
    <li className={`${cardClass} p-3`}>
      <div className="flex items-center justify-between">
        <button onClick={() => setExpanded((v) => !v)} className="font-medium hover:underline">
          {piece.title}
        </button>
        <button onClick={handleDelete} className={dangerLinkClass}>
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
            className={inputClass}
          />
          <input
            type="text"
            value={fields.composer}
            onChange={(e) => setFields((f) => ({ ...f, composer: e.target.value }))}
            placeholder="Composer"
            className={inputClass}
          />
          <input
            type="text"
            value={fields.arranger}
            onChange={(e) => setFields((f) => ({ ...f, arranger: e.target.value }))}
            placeholder="Arranger"
            className={inputClass}
          />
          <textarea
            value={fields.notes}
            onChange={(e) => setFields((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Notes"
            className={inputClass}
          />
          <input
            type="text"
            value={fields.youtubeUrl}
            onChange={(e) => setFields((f) => ({ ...f, youtubeUrl: e.target.value }))}
            placeholder="YouTube reference link"
            className={inputClass}
          />
          <button onClick={handleSave} className={primaryButtonClass}>
            Save
          </button>

          <div className="mt-3 border-t border-stone-100 pt-3 dark:border-stone-800">
            <p className="text-sm font-medium">Files</p>
            {detail === undefined ? (
              <p className="text-sm text-stone-500 dark:text-stone-400">Loading…</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {detail?.files.map((file) => (
                  <li key={file.storageId} className="flex items-center justify-between text-sm">
                    <span>
                      {file.filename}{" "}
                      <span className="text-stone-500 dark:text-stone-400">({file.kind})</span>
                    </span>
                    <button
                      onClick={() => detachFile({ pieceId: piece._id, storageId: file.storageId })}
                      className={dangerLinkClass}
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
