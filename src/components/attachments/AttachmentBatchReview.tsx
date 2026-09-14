import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { inputClass, primaryButtonClass } from "../../design/forms";
import {
  addFilesToAttachmentBatchReview,
  bulkSetReviewRowPurpose,
  bulkSetReviewRowVoiceParts,
  canPublishAttachmentBatchReview,
  createAttachmentBatchReview,
  describeFinishBlocker,
  removeReviewRow,
  setAttachmentBatchReviewCredits,
  setReviewRowExactDuplicateDecision,
  setReviewRowDuration,
  setReviewRowFilename,
  setReviewRowFormat,
  setReviewRowIncluded,
  setReviewRowNameCollisionDecision,
  setReviewRowPrimary,
  setReviewRowPurpose,
  setReviewRowVoiceParts,
  type AttachmentBatchReviewState,
  type AttachmentReviewRow,
  type ExactDuplicateDecision,
  type NameCollisionDecision,
} from "../../lib/attachmentBatchReview";
import {
  classifyAttachment,
  generateStandardizedFilename,
  getAllowedPurposes,
  type AttachmentFormat,
  type AttachmentPurpose,
  type InferredValue,
  type VoicePart,
} from "../../lib/attachmentClassification";
import type { StorageId, TrackedUpload, UploadedFile } from "../../lib/batchUpload";
import { useBatchUpload } from "../../lib/useBatchUpload";
import { useTrackedMutation } from "../../lib/useTrackedMutation";

const FORMATS: readonly AttachmentFormat[] = [
  "pdf",
  "musescore",
  "musicxml",
  "midi",
  "audio",
  "image",
  "other",
];

const PURPOSES: readonly AttachmentPurpose[] = [
  "fullScore",
  "partScore",
  "accompanimentScore",
  "lyricsText",
  "pronunciation",
  "editableFullScore",
  "editablePartScore",
  "fullMix",
  "partRehearsal",
  "accompaniment",
  "referencePerformance",
  "other",
];

const LABELS: Record<AttachmentFormat | AttachmentPurpose, string> = {
  pdf: "PDF",
  musescore: "MuseScore",
  musicxml: "MusicXML",
  midi: "MIDI",
  audio: "Audio",
  image: "Image",
  other: "Other",
  fullScore: "Full score",
  partScore: "Part score",
  accompanimentScore: "Accompaniment score",
  lyricsText: "Lyrics / text",
  pronunciation: "Pronunciation",
  editableFullScore: "Editable full score",
  editablePartScore: "Editable part score",
  fullMix: "Full mix",
  partRehearsal: "Part rehearsal",
  accompaniment: "Accompaniment",
  referencePerformance: "Reference performance",
};

type ActiveVoicePart = Pick<Doc<"voiceParts">, "_id" | "name" | "displayOrder" | "isAll">;

export interface AttachmentBatchReviewProps {
  pieceId: Id<"pieces">;
  title: string;
  composer?: string;
  arranger?: string;
  initialFiles?: readonly File[];
  onInitialFilesAccepted?: () => void;
}

function marker(value: InferredValue<unknown> | null): React.ReactNode {
  if (!value) return null;
  return value.inferred ? (
    <span className="ml-1 text-xs font-normal text-brand-600 dark:text-brand-400">
      inferred
    </span>
  ) : null;
}

function statusLabel(upload: TrackedUpload): string {
  switch (upload.status) {
    case "queued":
      return "Queued";
    case "uploading":
      return `Uploading ${upload.progress.percent}%`;
    case "succeeded":
      return "Uploaded";
    case "failed":
      return "Upload failed";
    case "cancelled":
      return "Cancelled";
  }
}

function reviewVoiceParts(parts: readonly ActiveVoicePart[]): VoicePart[] {
  return parts.map((part) => ({
    id: part._id,
    name: part.name,
    displayOrder: part.displayOrder,
    isAll: part.isAll,
  }));
}

function extensionOf(filename: string): string {
  return /\.([^.]+)$/u.exec(filename.trim())?.[1] ?? "";
}

async function detectAudioDuration(file: File): Promise<number | undefined> {
  if (!file.type.startsWith("audio/")) return undefined;
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<number | undefined>((resolve) => {
      const audio = document.createElement("audio");
      const finish = (duration?: number) => {
        audio.removeAttribute("src");
        audio.load();
        resolve(
          duration !== undefined && Number.isFinite(duration) && duration > 0
            ? duration
            : undefined,
        );
      };
      audio.preload = "metadata";
      audio.addEventListener("loadedmetadata", () => finish(audio.duration), {
        once: true,
      });
      audio.addEventListener("error", () => finish(), { once: true });
      audio.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface ReviewRowEditorProps {
  row: AttachmentReviewRow;
  upload: TrackedUpload;
  voiceParts: readonly VoicePart[];
  selectedForBulk: boolean;
  onSelectForBulk: (selected: boolean) => void;
  onChange: (next: AttachmentBatchReviewState) => void;
  state: AttachmentBatchReviewState;
  onCancelUpload: () => Promise<void>;
}

function ReviewRowEditor({
  row,
  upload,
  voiceParts,
  selectedForBulk,
  onSelectForBulk,
  onChange,
  state,
  onCancelUpload,
}: ReviewRowEditorProps) {
  const allowedPurposes = row.format
    ? getAllowedPurposes(row.format.value)
    : PURPOSES;
  const newVersionTarget = row.nameCollisions.find(
    (collision) => collision.kind === "existing",
  )?.attachmentId;

  function togglePart(partId: string, checked: boolean) {
    const next = checked
      ? [...row.voiceParts.value, partId]
      : row.voiceParts.value.filter((id) => id !== partId);
    onChange(setReviewRowVoiceParts(state, row.id, next));
  }

  return (
    <article className="rounded-lg border border-stone-200 p-3 dark:border-stone-700" data-testid={`review-row-${row.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-stone-900 dark:text-stone-100">{row.originalFilename}</p>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            {statusLabel(upload)} · {(row.size / 1024).toFixed(1)} KB
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <label>
            <input
              type="checkbox"
              aria-label={`${row.originalFilename} Select`}
              checked={selectedForBulk}
              onChange={(event) => onSelectForBulk(event.target.checked)}
            />{" "}
            Select
          </label>
          <label>
            <input
              type="checkbox"
              aria-label={`${row.originalFilename} Include`}
              checked={row.included}
              onChange={(event) => onChange(setReviewRowIncluded(state, row.id, event.target.checked))}
            />{" "}
            Include
          </label>
          <button type="button" className="text-danger hover:underline" onClick={() => void onCancelUpload()}>
            Cancel upload
          </button>
        </div>
      </div>

      {row.included && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
            Format{marker(row.format)}
            <select
              aria-label={`Format for ${row.originalFilename}`}
              className={`${inputClass} mt-1`}
              value={row.format?.value ?? ""}
              onChange={(event) =>
                onChange(setReviewRowFormat(state, row.id, event.target.value as AttachmentFormat))
              }
            >
              <option value="" disabled>Choose format</option>
              {FORMATS.map((format) => <option key={format} value={format}>{LABELS[format]}</option>)}
            </select>
          </label>

          <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
            Purpose{marker(row.purpose)}
            <select
              aria-label={`Purpose for ${row.originalFilename}`}
              className={`${inputClass} mt-1`}
              value={row.purpose?.value ?? ""}
              onChange={(event) =>
                onChange(setReviewRowPurpose(state, row.id, event.target.value as AttachmentPurpose))
              }
            >
              <option value="" disabled>Choose purpose</option>
              {row.purpose && !allowedPurposes.includes(row.purpose.value) && (
                <option value={row.purpose.value}>{LABELS[row.purpose.value]} (not valid for format)</option>
              )}
              {allowedPurposes.map((purpose) => <option key={purpose} value={purpose}>{LABELS[purpose]}</option>)}
            </select>
          </label>

          <fieldset className="md:col-span-2">
            <legend className="text-sm font-medium text-stone-700 dark:text-stone-300">
              Voice parts{marker(row.voiceParts)}
            </legend>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {voiceParts.map((part) => (
                <label key={part.id} className="text-sm">
                  <input
                    type="checkbox"
                    aria-label={`${row.originalFilename} ${part.name}`}
                    checked={row.voiceParts.value.includes(part.id)}
                    onChange={(event) => togglePart(part.id, event.target.checked)}
                  />{" "}
                  {part.name}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="text-sm font-medium text-stone-700 dark:text-stone-300 md:col-span-2">
            Filename{marker(row.filename)}
            <input
              aria-label={`Filename for ${row.originalFilename}`}
              className={`${inputClass} mt-1`}
              value={row.filename.value}
              onChange={(event) => onChange(setReviewRowFilename(state, row.id, event.target.value))}
            />
          </label>

          {(row.format?.value === "audio" || row.format?.value === "midi") && (
            <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
              Duration in seconds <span className="font-normal text-stone-500">optional</span>
              <input
                type="number"
                min="0"
                step="0.1"
                aria-label={`Duration for ${row.originalFilename}`}
                className={`${inputClass} mt-1`}
                value={row.durationSeconds ?? ""}
                onChange={(event) =>
                  onChange(
                    setReviewRowDuration(
                      state,
                      row.id,
                      event.target.value === ""
                        ? undefined
                        : Number(event.target.value),
                    ),
                  )
                }
              />
            </label>
          )}

          <label className="text-sm md:col-span-2">
            <input
              type="checkbox"
              aria-label={`${row.originalFilename} Primary score`}
              checked={row.isPrimary}
              onChange={(event) => onChange(setReviewRowPrimary(state, row.id, event.target.checked))}
            />{" "}
            Primary score
            {row.primaryMarker === "inferred" && (
              <span className="ml-1 text-xs text-brand-600 dark:text-brand-400">inferred</span>
            )}
          </label>

          {row.exactDuplicates.length > 0 && (
            <label className="text-sm font-medium text-amber-800 dark:text-amber-300 md:col-span-2">
              Exact file already exists ({row.exactDuplicates.map((match) => match.filename).join(", ")})
              <select
                aria-label={`Exact duplicate decision for ${row.originalFilename}`}
                className={`${inputClass} mt-1`}
                value={row.exactDuplicateDecision ?? ""}
                onChange={(event) =>
                  onChange(
                    setReviewRowExactDuplicateDecision(
                      state,
                      row.id,
                      event.target.value as ExactDuplicateDecision,
                    ),
                  )
                }
              >
                <option value="" disabled>Choose what to do</option>
                <option value="skip">Skip</option>
                <option value="uploadAnyway">Upload anyway</option>
              </select>
            </label>
          )}

          {row.nameCollisions.length > 0 && (
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Filename already exists ({row.nameCollisions.map((match) => match.filename).join(", ")})
                <select
                  aria-label={`Filename collision decision for ${row.originalFilename}`}
                  className={`${inputClass} mt-1`}
                  value={row.nameCollisionDecision ?? ""}
                  onChange={(event) => {
                    const decision = event.target.value as NameCollisionDecision;
                    onChange(
                      setReviewRowNameCollisionDecision(
                        state,
                        row.id,
                        decision,
                        decision === "newVersion" ? newVersionTarget ?? null : null,
                      ),
                    );
                  }}
                >
                  <option value="" disabled>Choose what to do</option>
                  <option value="newVersion" disabled={!newVersionTarget}>Upload as new version</option>
                  <option value="rename">Keep both — rename this file</option>
                  <option value="skip">Skip</option>
                </select>
              </label>
            </div>
          )}

          {row.validation.length > 0 && (
            <ul className="text-sm text-danger md:col-span-2">
              {row.validation.map((issue) => <li key={issue.code}>{issue.message}</li>)}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}

export function AttachmentBatchReview({
  pieceId,
  title,
  composer,
  arranger,
  initialFiles = [],
  onInitialFilesAccepted,
}: AttachmentBatchReviewProps) {
  const activeVoiceParts = useQuery(api.voiceParts.listActive);
  const detail = useQuery(api.pieceAttachments.getManagementDetail, { pieceId });
  const registerPendingUpload = useMutation(api.pieceAttachments.registerPendingUpload);
  const discardUnreferencedStorage = useMutation(api.pieceAttachments.discardUnreferencedStorage);
  const { run: publishBatch, pending: publishing, error: publishError } = useTrackedMutation(
    api.pieceAttachments.publishBatch,
  );
  const uploads = useBatchUpload(api.pieces.generateUploadUrl, {
    registerUpload: async (upload: UploadedFile) => {
      await registerPendingUpload({ pieceId, storageId: upload.storageId });
    },
    discardUnreferenced: async (storageIds: readonly StorageId[]) => {
      await discardUnreferencedStorage({ storageIds: [...storageIds] });
    },
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const detectedDurations = useRef(new Map<string, number>());
  const acceptedInitialFiles = useRef(false);
  const [review, setReview] = useState<AttachmentBatchReviewState | null>(null);
  const [selectedForBulk, setSelectedForBulk] = useState<string[]>([]);
  const [bulkPurpose, setBulkPurpose] = useState<AttachmentPurpose>("other");
  const [bulkParts, setBulkParts] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [rejectedFilenames, setRejectedFilenames] = useState<string[]>([]);

  const parts = useMemo(
    () => reviewVoiceParts(activeVoiceParts ?? []),
    [activeVoiceParts],
  );
  const existingAttachments = useMemo(
    () =>
      (detail?.attachments ?? []).map(({ attachment, currentVersion }) => ({
        id: attachment._id,
        filename:
          attachment.filenameOverride ??
          generateStandardizedFilename({
            title,
            composer,
            arranger,
            purpose: attachment.purpose,
            voicePartIds: attachment.voicePartIds,
            parts,
            extension: extensionOf(currentVersion.originalFilename),
          }),
        sha256: currentVersion.sha256,
      })),
    [arranger, composer, detail, parts, title],
  );
  const hasPrimaryScore = Boolean(
    detail?.attachments.some(({ attachment }) => attachment.isPrimary),
  );

  function emptyReviewState(): AttachmentBatchReviewState {
    return createAttachmentBatchReview({
      piece: { title, composer, arranger, hasPrimaryScore },
      voiceParts: parts,
      existingAttachments,
      files: [],
    });
  }

  useEffect(() => {
    if (activeVoiceParts === undefined || detail === undefined) return;
    setReview((current) =>
      current && current.rows.length > 0 ? current : emptyReviewState(),
    );
  }, [activeVoiceParts, arranger, composer, detail, existingAttachments, hasPrimaryScore, parts, title]);

  useEffect(() => {
    setReview((current) =>
      current
        ? setAttachmentBatchReviewCredits(current, { title, composer, arranger })
        : current,
    );
  }, [arranger, composer, title]);

  useEffect(() => {
    setReview((current) => {
      if (!current) return current;
      const knownIds = new Set(current.rows.map((row) => row.id));
      const completed = uploads.files.flatMap((upload) =>
        upload.status === "succeeded" && upload.uploaded && !knownIds.has(upload.id)
          ? [{
              id: upload.id,
              name: upload.file.name,
              size: upload.file.size,
              sha256: upload.uploaded.sha256,
              durationSeconds: detectedDurations.current.get(upload.id),
            }]
          : [],
      );
      return completed.length > 0
        ? addFilesToAttachmentBatchReview(current, completed)
        : current;
    });
  }, [uploads.files]);

  function addFiles(files: readonly File[]) {
    if (files.length === 0) return;
    setCleanupError(null);
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      const classification = classifyAttachment({ name: file.name, size: file.size }, parts);
      if (classification.ok) accepted.push(file);
      else rejected.push(file.name);
    }
    if (rejected.length > 0) {
      setRejectedFilenames((current) => [...current, ...rejected]);
    }
    if (accepted.length === 0) return;
    const ids = uploads.addFiles(accepted);
    for (const [index, id] of ids.entries()) {
      const file = accepted[index];
      if (!file) continue;
      void detectAudioDuration(file).then((durationSeconds) => {
        if (durationSeconds === undefined) return;
        detectedDurations.current.set(id, durationSeconds);
        setReview((current) =>
          current
            ? setReviewRowDuration(current, id, durationSeconds)
            : current,
        );
      });
    }
  }

  useEffect(() => {
    if (
      acceptedInitialFiles.current ||
      !review ||
      initialFiles.length === 0
    ) {
      return;
    }
    acceptedInitialFiles.current = true;
    addFiles(initialFiles);
    onInitialFilesAccepted?.();
  }, [initialFiles, onInitialFilesAccepted, review]);

  async function cancelOne(upload: TrackedUpload) {
    setReview((current) => (current ? removeReviewRow(current, upload.id) : current));
    await uploads.cancel(upload.id);
  }

  async function cancelBatch() {
    const cleaned = await uploads.cancelAll();
    if (!cleaned) return;
    uploads.clearCompleted();
    setSelectedForBulk([]);
    setRejectedFilenames([]);
    setReview(emptyReviewState());
  }

  async function finish() {
    if (!review) return;
    setCleanupError(null);
    const includedRows = review.rows.filter((row) => row.included);
    const includedIds = new Set(includedRows.map((row) => row.id));
    const uploadedById = new Map(
      uploads.files.flatMap((upload) =>
        upload.status === "succeeded" && upload.uploaded
          ? [[upload.id, upload.uploaded] as const]
          : [],
      ),
    );
    const result = await publishBatch({
      pieceId,
      attachments: includedRows.map((row) => {
        const uploaded = uploadedById.get(row.id);
        if (!uploaded || !row.format || !row.purpose) {
          throw new Error("Finish was enabled before every included file was ready");
        }
        return {
          storageId: uploaded.storageId,
          originalFilename: uploaded.originalFilename,
          format: row.format.value,
          purpose: row.purpose.value,
          voicePartIds: row.voiceParts.value as Id<"voiceParts">[],
          ...(row.filenameManuallyOverridden
            ? { filenameOverride: row.filename.value }
            : {}),
          ...(row.durationSeconds !== undefined
            ? { durationSeconds: row.durationSeconds }
            : {}),
          ...(row.nameCollisionDecision === "newVersion" &&
          row.newVersionAttachmentId
            ? {
                replaceAttachmentId:
                  row.newVersionAttachmentId as Id<"pieceAttachments">,
              }
            : {}),
          isPrimary: row.isPrimary,
        };
      }),
    });
    if (result === undefined) return;

    const excludedStorageIds = uploads.files.flatMap((upload) =>
      upload.status === "succeeded" && upload.uploaded && !includedIds.has(upload.id)
        ? [upload.uploaded.storageId]
        : [],
    );
    if (excludedStorageIds.length > 0) {
      try {
        await discardUnreferencedStorage({ storageIds: excludedStorageIds });
      } catch (error) {
        setCleanupError(
          error instanceof Error
            ? `The batch was published, but skipped-file cleanup failed: ${error.message}`
            : "The batch was published, but skipped-file cleanup failed.",
        );
      }
    }
    uploads.clearCompleted();
    setSelectedForBulk([]);
    setRejectedFilenames([]);
    setReview(emptyReviewState());
  }

  const includedRows = review?.rows.filter((row) => row.included) ?? [];
  const uploadsReady =
    includedRows.length > 0 &&
    includedRows.every((row) =>
      uploads.files.some((upload) => upload.id === row.id && upload.status === "succeeded"),
    );
  const unresolvedUploads = uploads.files.some(
    (upload) => upload.status === "queued" || upload.status === "uploading" || upload.status === "failed",
  );
  const canFinish = Boolean(
    review &&
    canPublishAttachmentBatchReview(review) &&
    uploadsReady &&
    !unresolvedUploads &&
    !publishing,
  );
  const finishBlockerMessage =
    !canFinish && !publishing
      ? describeFinishBlocker({
          review,
          queuedOrUploadingCount: uploads.files.filter(
            (upload) => upload.status === "queued" || upload.status === "uploading",
          ).length,
          failedCount: uploads.files.filter((upload) => upload.status === "failed").length,
        })
      : null;

  if (activeVoiceParts === undefined || detail === undefined || !review) {
    return <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">Loading attachment tools…</p>;
  }

  return (
    <section className="mt-4 space-y-3 border-t border-stone-200 pt-4 dark:border-stone-700" aria-label="Batch attachment upload">
      <div>
        <h3 className="font-medium text-stone-900 dark:text-stone-100">Add attachments</h3>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Select PDFs, MuseScore sources, rehearsal tracks, and other files together. Nothing becomes visible until Finish.
        </p>
      </div>

      {detail.attachments.length > 0 && (
        <div className="text-sm">
          <p className="font-medium">Published attachments</p>
          <ul className="mt-1 list-disc pl-5 text-stone-600 dark:text-stone-300">
            {detail.attachments.map(({ attachment, currentVersion }) => (
              <li key={attachment._id}>
                {attachment.filenameOverride ?? currentVersion.originalFilename}
                {attachment.isPrimary ? " — primary" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div
        className={`rounded-lg border-2 border-dashed p-5 text-center ${
          dragging
            ? "border-brand-500 bg-brand-50 dark:bg-brand-950"
            : "border-stone-300 dark:border-stone-700"
        }`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          addFiles([...event.dataTransfer.files]);
        }}
      >
        <p className="text-sm">Drop files here, or</p>
        <button type="button" className="mt-2 text-sm text-brand-600 underline dark:text-brand-400" onClick={() => inputRef.current?.click()}>
          choose files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          aria-label="Choose attachment files"
          onChange={(event) => {
            addFiles([...(event.target.files ?? [])]);
            event.target.value = "";
          }}
        />
      </div>

      {uploads.error && <p className="text-sm text-danger">{uploads.error}</p>}
      {cleanupError && <p className="text-sm text-danger">{cleanupError}</p>}
      {publishError && <p className="text-sm text-danger">{publishError}</p>}
      {rejectedFilenames.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <p>
            {rejectedFilenames.length} file{rejectedFilenames.length === 1 ? "" : "s"} were not
            added because they are empty or an unsupported executable type:{" "}
            {rejectedFilenames.join(", ")}
          </p>
          <button
            type="button"
            className="mt-1 text-xs underline"
            onClick={() => setRejectedFilenames([])}
          >
            Dismiss
          </button>
        </div>
      )}

      {uploads.files.map((upload) => {
        const reviewRow = review.rows.find((row) => row.id === upload.id);
        if (reviewRow) {
          return (
            <ReviewRowEditor
              key={upload.id}
              row={reviewRow}
              upload={upload}
              voiceParts={review.voiceParts}
              selectedForBulk={selectedForBulk.includes(upload.id)}
              onSelectForBulk={(selected) =>
                setSelectedForBulk((current) =>
                  selected
                    ? [...new Set([...current, upload.id])]
                    : current.filter((id) => id !== upload.id),
                )
              }
              state={review}
              onChange={setReview}
              onCancelUpload={() => cancelOne(upload)}
            />
          );
        }
        return (
          <article key={upload.id} className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{upload.file.name}</p>
                <p className="text-xs text-stone-500 dark:text-stone-400">{statusLabel(upload)}</p>
                {upload.status === "uploading" && (
                  <progress className="mt-1 w-full" max={100} value={upload.progress.percent}>
                    {upload.progress.percent}%
                  </progress>
                )}
                {upload.warning && <p className="text-xs text-amber-700 dark:text-amber-300">{upload.warning}</p>}
                {upload.error && <p className="text-xs text-danger">{upload.error}</p>}
              </div>
              <div className="flex gap-2">
                {upload.status === "failed" && (
                  <button type="button" className="text-sm text-brand-600 underline dark:text-brand-400" onClick={() => uploads.retry(upload.id)}>
                    Retry
                  </button>
                )}
                {upload.status !== "cancelled" && (
                  <button type="button" className="text-sm text-danger hover:underline" onClick={() => void cancelOne(upload)}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </article>
        );
      })}

      {selectedForBulk.length > 0 && (
        <div
          className="rounded-lg bg-stone-50 p-3 dark:bg-stone-800"
          role="group"
          aria-label="Bulk edit selected attachments"
        >
          <p className="text-sm font-medium">Edit {selectedForBulk.length} selected</p>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium" htmlFor={`bulk-purpose-${pieceId}`}>Purpose</label>
              <div className="mt-1 flex gap-2">
                <select id={`bulk-purpose-${pieceId}`} className={inputClass} value={bulkPurpose} onChange={(event) => setBulkPurpose(event.target.value as AttachmentPurpose)}>
                  {PURPOSES.map((purpose) => <option key={purpose} value={purpose}>{LABELS[purpose]}</option>)}
                </select>
                <button type="button" className={primaryButtonClass} onClick={() => setReview(bulkSetReviewRowPurpose(review, selectedForBulk, bulkPurpose))}>
                  Apply
                </button>
              </div>
            </div>
            <fieldset>
              <legend className="text-sm font-medium">Voice parts</legend>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                {review.voiceParts.map((part) => (
                  <label key={part.id} className="text-sm">
                    <input
                      type="checkbox"
                      checked={bulkParts.includes(part.id)}
                      onChange={(event) => setBulkParts((current) =>
                        event.target.checked
                          ? [...current, part.id]
                          : current.filter((id) => id !== part.id),
                      )}
                    />{" "}{part.name}
                  </label>
                ))}
              </div>
              <button type="button" className={`${primaryButtonClass} mt-2`} onClick={() => setReview(bulkSetReviewRowVoiceParts(review, selectedForBulk, bulkParts))}>
                Apply parts
              </button>
            </fieldset>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={primaryButtonClass} disabled={!canFinish} onClick={() => void finish()}>
          {publishing ? "Finishing…" : "Finish"}
        </button>
        <button
          type="button"
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm dark:border-stone-700"
          disabled={uploads.files.length === 0}
          onClick={() => void cancelBatch()}
        >
          Cancel batch
        </button>
        {finishBlockerMessage && (
          <p className="text-sm text-stone-500 dark:text-stone-400">{finishBlockerMessage}</p>
        )}
      </div>
    </section>
  );
}
