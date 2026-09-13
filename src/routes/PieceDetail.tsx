import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  createAttachmentPresentation,
  type PresentedAttachment,
} from "../lib/attachmentPresentation";
import { MemberPage, usePageTitle } from "../design/MemberPage";
import { linkClass } from "../design/forms";
import NotFound from "./NotFound";

export default function PieceDetail() {
  return <MemberPage title="Music Library">{() => <PieceDetailContent />}</MemberPage>;
}

function fileExtension(filename: string): string {
  const match = /\.([^.]+)$/u.exec(filename.trim());
  return match?.[1] ?? "";
}

function formatDuration(durationSeconds: number): string {
  const totalSeconds = Math.round(durationSeconds);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const paddedSeconds = seconds.toString().padStart(2, "0");
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${paddedSeconds}`
    : `${minutes}:${paddedSeconds}`;
}

function formatUpdatedAt(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

function AttachmentItem({ attachment }: { attachment: PresentedAttachment }) {
  const preview = attachment.preview;
  const isDownloadOnly = preview.kind === "download";

  return (
    <article className="rounded-lg border border-stone-200 p-4 dark:border-stone-700">
      <h4 className="text-sm font-medium text-stone-900 dark:text-stone-100">
        {attachment.displayName}
      </h4>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
        {attachment.partLabel && <span>Parts: {attachment.partLabel}</span>}
        {attachment.durationSeconds !== undefined && attachment.durationSeconds !== null && (
          <span>Duration: {formatDuration(attachment.durationSeconds)}</span>
        )}
        <time dateTime={new Date(attachment.updatedAt).toISOString()}>
          Updated {formatUpdatedAt(attachment.updatedAt)}
        </time>
      </div>

      {!preview.available ? (
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-300" role="status">
          This file is currently unavailable.
        </p>
      ) : (
        <>
          {preview.kind === "pdf" && (
            <iframe
              src={preview.url ?? undefined}
              className="mt-3 h-64 w-full rounded-lg border border-stone-200 dark:border-stone-700"
              title={`Preview of ${attachment.displayName}`}
            />
          )}
          {preview.kind === "audio" && (
            <audio controls src={preview.url ?? undefined} className="mt-3 w-full">
              Your browser does not support audio previews.
            </audio>
          )}
          {preview.kind === "image" && (
            <img
              src={preview.url ?? undefined}
              alt={`Preview of ${attachment.displayName}`}
              className="mt-3 max-h-96 w-auto max-w-full rounded-lg border border-stone-200 dark:border-stone-700"
            />
          )}
          {isDownloadOnly && (
            <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">Download only</p>
          )}
          <p className="mt-3">
            <a href={attachment.download.url ?? undefined} download={attachment.downloadName} className={linkClass}>
              Download {attachment.downloadName}
            </a>
          </p>
        </>
      )}
    </article>
  );
}

function PieceDetailContent() {
  const { pieceId } = useParams<{ pieceId: string }>();
  const detail = useQuery(api.pieceAttachments.getMemberDetail, {
    pieceId: pieceId as Id<"pieces">,
  });
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  usePageTitle(detail?.piece.title);

  if (detail === null) return <NotFound />;

  if (detail === undefined) {
    return <p className="text-sm text-stone-500 dark:text-stone-400">Loading…</p>;
  }

  const { piece } = detail;
  const byline = [piece.composer, piece.arranger && `arr. ${piece.arranger}`]
    .filter(Boolean)
    .join(" — ");
  const presentation = createAttachmentPresentation({
    piece: {
      title: piece.title,
      composer: piece.composer,
      arranger: piece.arranger,
    },
    attachments: detail.attachments.map(({ attachment, currentVersion, voiceParts, url }) => ({
      id: attachment._id,
      format: attachment.format,
      purpose: attachment.purpose,
      parts: voiceParts.map((part) => ({
        id: part._id,
        name: part.name,
        displayOrder: part.displayOrder,
        isAll: part.isAll,
      })),
      manualOrder: attachment.displayOrder,
      isPrimary: attachment.isPrimary,
      filenameOverride: attachment.filenameOverride,
      originalExtension: fileExtension(currentVersion.originalFilename),
      url,
      durationSeconds: currentVersion.durationSeconds,
      updatedAt: attachment.updatedAt,
    })),
    selectedPartId,
  });
  const hasAttachments = presentation.primaryAction !== null || presentation.groups.length > 0;

  return (
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
      {presentation.availablePartFilters.length > 0 && (
        <fieldset className="mt-3">
          <legend className="sr-only">Filter files by voice part</legend>
          <div className="flex flex-wrap gap-2" aria-label="Filter files by voice part">
            <button
              type="button"
              aria-pressed={selectedPartId === null}
              onClick={() => setSelectedPartId(null)}
              className="rounded-md border border-stone-300 px-3 py-1 text-sm text-stone-700 dark:border-stone-600 dark:text-stone-200"
            >
              All parts
            </button>
            {presentation.availablePartFilters.map((part) => (
              <button
                key={part.id}
                type="button"
                aria-pressed={selectedPartId === part.id}
                onClick={() => setSelectedPartId(part.id)}
                className="rounded-md border border-stone-300 px-3 py-1 text-sm text-stone-700 dark:border-stone-600 dark:text-stone-200"
              >
                {part.name}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {!hasAttachments ? (
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">No files attached.</p>
      ) : (
        <div className="mt-4 space-y-6">
          {presentation.primaryAction && (
            <section aria-labelledby="main-score-heading">
              <h3 id="main-score-heading" className="text-base font-semibold text-stone-900 dark:text-stone-100">
                Main score
              </h3>
              {presentation.primaryAction.attachment.preview.available && (
                <p className="mt-2">
                  <a href={presentation.primaryAction.attachment.preview.url ?? undefined} className={linkClass}>
                    {presentation.primaryAction.label}
                  </a>
                </p>
              )}
              <div className="mt-3">
                <AttachmentItem attachment={presentation.primaryAction.attachment} />
              </div>
            </section>
          )}

          {presentation.groups.map((group) => (
            <section key={group.key} aria-labelledby={`${group.key}-heading`}>
              <h3 id={`${group.key}-heading`} className="text-base font-semibold text-stone-900 dark:text-stone-100">
                {group.label}
              </h3>
              {group.partSections ? (
                <div className="mt-3 space-y-4">
                  {group.partSections.map((section) => (
                    <section key={section.part?.id ?? "unassigned"} aria-label={`${section.label} rehearsal files`}>
                      <h4 className="text-sm font-medium text-stone-700 dark:text-stone-300">{section.label}</h4>
                      <div className="mt-2 space-y-3">
                        {section.attachments.map((attachment) => (
                          <AttachmentItem key={attachment.id} attachment={attachment} />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {group.attachments.map((attachment) => (
                    <AttachmentItem key={attachment.id} attachment={attachment} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
