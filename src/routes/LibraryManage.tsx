import { useState } from "react";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { useTrackedMutation } from "../lib/useTrackedMutation";
import { MemberPage } from "../design/MemberPage";
import { inputClass, primaryButtonClass, dangerLinkClass, cardClass } from "../design/forms";
import { AttachmentBatchReview } from "../components/attachments/AttachmentBatchReview";

export default function LibraryManage() {
  return (
    <MemberPage
      title="Manage Music Library"
      require="manageLibrary"
      backTo={{ to: "/library", label: "Back to Music Library" }}
    >
      {() => <LibraryManageContent />}
    </MemberPage>
  );
}

function LibraryManageContent() {
  const pieces = useQuery(api.pieces.list);
  const { run: createPiece, pending: creating, error: createError } = useTrackedMutation(api.pieces.create);
  const [newTitle, setNewTitle] = useState("");
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [initialBatch, setInitialBatch] = useState<{
    pieceId: string;
    files: File[];
  } | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const id = await createPiece({ title: newTitle.trim() });
    if (id !== undefined) {
      if (newFiles.length > 0) {
        setInitialBatch({ pieceId: id, files: newFiles });
      }
      setNewTitle("");
      setNewFiles([]);
    }
  }

  return (
    <>
      <form onSubmit={handleCreate} className="space-y-2">
        <div className="flex gap-2">
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
        </div>
        <label className="block text-sm text-stone-600 dark:text-stone-300">
          Files for the new Piece <span className="text-stone-500">optional</span>
          <input
            type="file"
            multiple
            aria-label="Files for new Piece"
            className="mt-1 block text-sm"
            onChange={(event) => setNewFiles([...(event.target.files ?? [])])}
          />
        </label>
        {newFiles.length > 0 && (
          <p className="text-xs text-stone-500 dark:text-stone-400">
            {newFiles.length} file{newFiles.length === 1 ? "" : "s"} will open in review after the Piece is created.
          </p>
        )}
      </form>
      {createError && <p className="mt-2 text-sm text-danger">{createError}</p>}

      {pieces === undefined ? (
        <p className="mt-4 text-sm text-stone-500 dark:text-stone-400">Loading…</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {pieces.map((piece) => (
            <PieceManageRow
              key={piece._id}
              piece={piece}
              initialFiles={
                initialBatch?.pieceId === piece._id
                  ? initialBatch.files
                  : undefined
              }
              onInitialFilesAccepted={() =>
                setInitialBatch((current) =>
                  current?.pieceId === piece._id ? null : current,
                )
              }
            />
          ))}
        </ul>
      )}
    </>
  );
}

function PieceManageRow({
  piece,
  initialFiles,
  onInitialFilesAccepted,
}: {
  piece: Doc<"pieces">;
  initialFiles?: readonly File[];
  onInitialFilesAccepted: () => void;
}) {
  const [expanded, setExpanded] = useState(initialFiles !== undefined);
  const { run: updatePiece, pending: saving, error: saveError } = useTrackedMutation(api.pieces.update);
  const { run: removePiece, error: removeError } = useTrackedMutation(api.pieces.remove);
  const { run: detachFile, error: detachError } = useTrackedMutation(api.pieces.detachFile);
  const detail = useQuery(api.pieces.get, expanded ? { pieceId: piece._id } : "skip");

  const [fields, setFields] = useState({
    title: piece.title,
    composer: piece.composer ?? "",
    arranger: piece.arranger ?? "",
    notes: piece.notes ?? "",
    youtubeUrl: piece.youtubeUrl ?? "",
  });

  const error = saveError ?? removeError ?? detachError;

  async function handleSave() {
    // "" normalizes to undefined server-side now, not here.
    await updatePiece({
      pieceId: piece._id,
      title: fields.title,
      composer: fields.composer,
      arranger: fields.arranger,
      notes: fields.notes,
      youtubeUrl: fields.youtubeUrl,
    });
  }

  async function handleDelete() {
    if (!confirm(`Delete "${piece.title}"? This also deletes its attached files.`)) return;
    await removePiece({ pieceId: piece._id });
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
          <button onClick={handleSave} disabled={saving} className={primaryButtonClass}>
            Save
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}

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
          </div>
          <AttachmentBatchReview
            pieceId={piece._id}
            title={fields.title}
            composer={fields.composer}
            arranger={fields.arranger}
            initialFiles={initialFiles}
            onInitialFilesAccepted={onInitialFilesAccepted}
          />
        </div>
      )}
    </li>
  );
}
