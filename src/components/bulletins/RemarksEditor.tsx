// The Remark editor inside the Bulletin manage page (#81): add, edit,
// reorder and remove per-Piece Remarks. Its own file so the route stays a
// form plus a preview, the same way the Setlist editor could have been.
//
// Every action writes straight through to its mutation rather than
// accumulating into the Bulletin's Save button: a Remark is its own row, so
// there is no draft state to lose, and the Piece reverse lookup should show
// what the Director actually left behind.
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useTrackedMutation } from "../../lib/useTrackedMutation";
import { moveItem } from "../../lib/reorder";
import { inputClass, labelClass, primaryButtonClass, dangerLinkClass } from "../../design/forms";

const NO_PIECE = "";

export function RemarksEditor({
  bulletinId,
  eventId,
}: {
  bulletinId: Id<"bulletins">;
  // The Bulletin's *saved* anchor, not the form's unsaved selection — the
  // Setlist to pre-fill from is the one the stored Bulletin points at.
  eventId: Id<"events"> | undefined;
}) {
  const remarks = useQuery(api.bulletinRemarks.listForBulletin, { bulletinId });
  const pieces = useQuery(api.pieces.list, {});
  const event = useQuery(api.events.get, eventId ? { eventId } : "skip");

  const { run: addRemark, pending: adding, error: addError } = useTrackedMutation(api.bulletinRemarks.add);
  const { run: updateRemark, error: updateError } = useTrackedMutation(api.bulletinRemarks.update);
  const { run: removeRemark, error: removeError } = useTrackedMutation(api.bulletinRemarks.remove);
  const { run: reorderRemarks, error: reorderError } = useTrackedMutation(api.bulletinRemarks.reorder);

  const [newPieceId, setNewPieceId] = useState(NO_PIECE);
  const [newText, setNewText] = useState("");
  // Each Remark's in-progress text, saved when its field loses focus. Keyed
  // by id and re-synced only when the set or order of Remarks changes, so
  // the query updating mid-sentence can't clobber what is being typed.
  const [texts, setTexts] = useState<Record<string, string>>({});
  const remarkIdsKey = (remarks ?? []).map((remark) => remark._id).join("|");

  useEffect(() => {
    if (!remarks) return;
    setTexts(Object.fromEntries(remarks.map((remark) => [remark._id, remark.text])));
  }, [remarkIdsKey]);

  const error = addError ?? updateError ?? removeError ?? reorderError;
  const remarkedPieceIds = new Set((remarks ?? []).map((remark) => remark.pieceId));
  // Pre-fill is a convenience only (#49): it offers the Setlist Pieces not
  // yet remarked on, and the Director stays free to remove any of them and
  // to remark on Pieces that were never on the Setlist.
  const unremarkedSetlist = (event?.setlist ?? []).filter((piece) => !remarkedPieceIds.has(piece._id));

  async function handleAdd() {
    if (newPieceId === NO_PIECE) return;
    await addRemark({ bulletinId, pieceId: newPieceId as Id<"pieces">, text: newText });
    setNewPieceId(NO_PIECE);
    setNewText("");
  }

  async function handlePrefill() {
    // One at a time, not Promise.all: displayOrder is read from the last
    // existing row, so concurrent adds would race onto the same number.
    for (const piece of unremarkedSetlist) {
      await addRemark({ bulletinId, pieceId: piece._id, text: "" });
    }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    if (!remarks) return;
    const ids = remarks.map((remark) => remark._id);
    const moved = moveItem(ids, index, direction);
    if (moved === ids) return;
    await reorderRemarks({ bulletinId, remarkIds: moved });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className={labelClass}>Remarks</h2>
        {unremarkedSetlist.length > 0 && (
          <button type="button" onClick={handlePrefill} disabled={adding} className={primaryButtonClass}>
            Pre-fill from Setlist
          </button>
        )}
      </div>
      <p className="text-xs text-stone-500 dark:text-stone-400">
        A note about one Piece. Remarks appear on the Piece as well as in the Bulletin, once this
        Bulletin is published.
      </p>

      {remarks === undefined ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">Loading…</p>
      ) : remarks.length === 0 ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">No Remarks yet.</p>
      ) : (
        <ul className="space-y-3">
          {remarks.map((remark, index) => (
            <li
              key={remark._id}
              className="rounded-lg border border-stone-200 p-3 dark:border-stone-800"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-stone-900 dark:text-stone-100">
                  {remark.pieceTitle}
                </span>
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Move ${remark.pieceTitle} up`}
                    onClick={() => handleMove(index, -1)}
                    disabled={index === 0}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${remark.pieceTitle} down`}
                    onClick={() => handleMove(index, 1)}
                    disabled={index === remarks.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={dangerLinkClass}
                    onClick={() => removeRemark({ remarkId: remark._id })}
                  >
                    Remove
                  </button>
                </span>
              </div>
              <textarea
                aria-label={`Remark about ${remark.pieceTitle}`}
                value={texts[remark._id] ?? ""}
                onChange={(e) => setTexts((t) => ({ ...t, [remark._id]: e.target.value }))}
                onBlur={() => updateRemark({ remarkId: remark._id, text: texts[remark._id] ?? "" })}
                rows={2}
                className={`mt-2 ${inputClass}`}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="remark-piece" className={labelClass}>
            Piece
          </label>
          <select
            id="remark-piece"
            value={newPieceId}
            onChange={(e) => setNewPieceId(e.target.value)}
            className={`mt-1 ${inputClass}`}
          >
            <option value={NO_PIECE}>Choose a Piece…</option>
            {(pieces ?? []).map((piece) => (
              <option key={piece._id} value={piece._id}>
                {piece.title}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[12rem] flex-[2]">
          <label htmlFor="remark-text" className={labelClass}>
            Remark
          </label>
          <input
            id="remark-text"
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            className={`mt-1 ${inputClass}`}
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={adding || newPieceId === NO_PIECE}
          className={primaryButtonClass}
        >
          Add Remark
        </button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
    </section>
  );
}
