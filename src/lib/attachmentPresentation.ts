import {
  generateStandardizedFilename,
  PURPOSE_LABELS,
  type AttachmentFormat,
  type AttachmentPurpose,
  type VoicePart,
} from "./attachmentClassification";

/** A configured choir part with the optional `isAll` flag made explicit. */
export type PresentationPart = Omit<VoicePart, "isAll"> & { isAll: boolean };

/** A current active attachment joined with its current revision and URL. */
export interface PresentationAttachmentInput {
  id: string;
  format: AttachmentFormat;
  purpose: AttachmentPurpose;
  parts: readonly PresentationPart[];
  manualOrder: number;
  isPrimary: boolean;
  filenameOverride?: string | null;
  originalExtension: string;
  url?: string | null;
  durationSeconds?: number | null;
  updatedAt: number;
}

export interface PresentationPieceInput {
  title: string;
  composer?: string | null;
  arranger?: string | null;
}

export interface AttachmentPresentationInput {
  piece: PresentationPieceInput;
  attachments: readonly PresentationAttachmentInput[];
  selectedPartId?: string | null;
}

export type AttachmentGroupKey =
  | "scoresText"
  | "rehearsal"
  | "accompanimentReference"
  | "editableOther";

export type PreviewKind = "pdf" | "audio" | "image" | "download";

export interface AttachmentPreview {
  kind: PreviewKind;
  url: string | null;
  available: boolean;
  unavailableReason?: "missing-url";
}

export interface AttachmentDownload {
  filename: string;
  url: string | null;
  available: boolean;
}

export interface PresentedAttachment {
  id: string;
  format: AttachmentFormat;
  purpose: AttachmentPurpose;
  parts: readonly PresentationPart[];
  partLabel: string | null;
  manualOrder: number;
  isPrimary: boolean;
  /**
   * Short label for headings and checkbox labels: the filename override
   * (without its extension) when set, otherwise the purpose label plus the
   * part label. Avoids repeating the piece title/composer that
   * `displayName`/`downloadName` carry via the standardized filename.
   */
  label: string;
  displayName: string;
  downloadName: string;
  preview: AttachmentPreview;
  download: AttachmentDownload;
  durationSeconds?: number | null;
  updatedAt: number;
}

export interface PrimaryAttachmentAction {
  kind: "openMainScore";
  label: "Open main score";
  attachment: PresentedAttachment;
}

export interface AttachmentPartSection {
  part: PresentationPart | null;
  label: string;
  attachments: readonly PresentedAttachment[];
}

export interface AttachmentGroup {
  key: AttachmentGroupKey;
  label: string;
  attachments: readonly PresentedAttachment[];
  /** Rehearsal files are also exposed in their configured part sections. */
  partSections?: readonly AttachmentPartSection[];
}

export interface PartFilter {
  id: string;
  name: string;
}

export interface AttachmentPresentationModel {
  primaryAction: PrimaryAttachmentAction | null;
  groups: readonly AttachmentGroup[];
  availablePartFilters: readonly PartFilter[];
  selectedPartId: string | null;
}

const GROUPS: ReadonlyArray<{
  key: AttachmentGroupKey;
  label: string;
}> = [
  { key: "scoresText", label: "Scores & text" },
  { key: "rehearsal", label: "Rehearsal" },
  { key: "accompanimentReference", label: "Accompaniment & reference" },
  { key: "editableOther", label: "Editable & other" },
];

const SCORE_TEXT_PURPOSES = new Set<AttachmentPurpose>([
  "fullScore",
  "partScore",
  "accompanimentScore",
  "lyricsText",
  "pronunciation",
]);

const ACCOMPANIMENT_REFERENCE_PURPOSES = new Set<AttachmentPurpose>([
  "fullMix",
  "accompaniment",
  "referencePerformance",
]);

const EDITABLE_OTHER_PURPOSES = new Set<AttachmentPurpose>([
  "editableFullScore",
  "editablePartScore",
  "other",
]);

const PART_SPECIFIC_PURPOSES = new Set<AttachmentPurpose>([
  "partScore",
  "editablePartScore",
  "partRehearsal",
]);

function groupForPurpose(purpose: AttachmentPurpose): AttachmentGroupKey {
  if (SCORE_TEXT_PURPOSES.has(purpose)) return "scoresText";
  if (purpose === "partRehearsal") return "rehearsal";
  if (ACCOMPANIMENT_REFERENCE_PURPOSES.has(purpose)) {
    return "accompanimentReference";
  }
  if (EDITABLE_OTHER_PURPOSES.has(purpose)) return "editableOther";
  return "editableOther";
}

function compareNumbers(left: number, right: number): number {
  const leftFinite = Number.isFinite(left);
  const rightFinite = Number.isFinite(right);
  if (!leftFinite && !rightFinite) return 0;
  if (!leftFinite) return 1;
  if (!rightFinite) return -1;
  return left - right;
}

function orderedParts(parts: readonly PresentationPart[]): PresentationPart[] {
  return parts
    .map((part, index) => ({ part, index }))
    .sort((left, right) => {
      if (left.part.isAll !== right.part.isAll) {
        return left.part.isAll ? -1 : 1;
      }
      return (
        compareNumbers(left.part.displayOrder, right.part.displayOrder) ||
        left.part.name.localeCompare(right.part.name) ||
        left.part.id.localeCompare(right.part.id) ||
        left.index - right.index
      );
    })
    .map(({ part }) => part);
}

function normalizedUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  return trimmed ? trimmed : null;
}

function normalizedExtension(extension: string): string {
  return extension
    .trim()
    .replace(/^\./u, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "");
}

function standardizedName(
  piece: PresentationPieceInput,
  attachment: PresentationAttachmentInput,
): string {
  const parts: VoicePart[] = [...attachment.parts];
  return generateStandardizedFilename({
    title: piece.title,
    composer: piece.composer ?? undefined,
    arranger: piece.arranger ?? undefined,
    purpose: attachment.purpose,
    voicePartIds: parts.map((part) => part.id),
    parts,
    extension: normalizedExtension(attachment.originalExtension),
  });
}

export function standardizedAttachmentName(
  piece: PresentationPieceInput,
  attachment: PresentationAttachmentInput,
): string {
  return standardizedName(piece, attachment);
}

function effectiveName(
  piece: PresentationPieceInput,
  attachment: PresentationAttachmentInput,
): string {
  const override = attachment.filenameOverride?.trim();
  return override || standardizedName(piece, attachment);
}

function withoutExtension(filename: string): string {
  return filename.replace(/\.[^./\\]+$/u, "");
}

function attachmentLabel(
  attachment: PresentationAttachmentInput,
  partLabel: string | null,
): string {
  const override = attachment.filenameOverride?.trim();
  if (override) return withoutExtension(override);
  const purposeLabel = PURPOSE_LABELS[attachment.purpose];
  return partLabel ? `${purposeLabel} · ${partLabel}` : purposeLabel;
}

export function previewKindForFormat(format: AttachmentFormat): PreviewKind {
  if (format === "pdf") return "pdf";
  if (format === "audio") return "audio";
  if (format === "image") return "image";
  return "download";
}

export function attachmentPreview(
  format: AttachmentFormat,
  url: string | null | undefined,
): AttachmentPreview {
  const normalized = normalizedUrl(url);
  const kind = previewKindForFormat(format);
  return normalized
    ? { kind, url: normalized, available: true }
    : { kind, url: null, available: false, unavailableReason: "missing-url" };
}

function presentAttachment(
  piece: PresentationPieceInput,
  attachment: PresentationAttachmentInput,
): PresentedAttachment {
  const parts = orderedParts(attachment.parts);
  const name = effectiveName(piece, attachment);
  const preview = attachmentPreview(attachment.format, attachment.url);
  const partLabel = parts.length ? parts.map((part) => part.name).join(" + ") : null;
  return {
    id: attachment.id,
    format: attachment.format,
    purpose: attachment.purpose,
    parts,
    partLabel,
    manualOrder: attachment.manualOrder,
    isPrimary: attachment.isPrimary,
    label: attachmentLabel(attachment, partLabel),
    displayName: name,
    downloadName: name,
    preview,
    download: { filename: name, url: preview.url, available: preview.available },
    durationSeconds: attachment.durationSeconds,
    updatedAt: attachment.updatedAt,
  };
}

function sortByManualOrder(
  attachments: readonly PresentedAttachment[],
  originalOrder: ReadonlyMap<string, number>,
): PresentedAttachment[] {
  return [...attachments].sort(
    (left, right) =>
      compareNumbers(left.manualOrder, right.manualOrder) ||
      (originalOrder.get(left.id) ?? 0) - (originalOrder.get(right.id) ?? 0) ||
      left.id.localeCompare(right.id),
  );
}

function partRank(part: PresentationPart | null): number {
  if (!part) return Number.POSITIVE_INFINITY;
  return part.isAll ? 0 : part.displayOrder + 1;
}

function rehearsalSectionFor(
  attachment: PresentedAttachment,
): PresentationPart | null {
  return attachment.parts[0] ?? null;
}

function buildGroup(
  definition: (typeof GROUPS)[number],
  attachments: readonly PresentedAttachment[],
  originalOrder: ReadonlyMap<string, number>,
): AttachmentGroup {
  if (definition.key !== "rehearsal") {
    return {
      ...definition,
      attachments: sortByManualOrder(attachments, originalOrder),
    };
  }

  const sections = new Map<string, {
    part: PresentationPart | null;
    attachments: PresentedAttachment[];
    firstIndex: number;
  }>();
  for (const attachment of attachments) {
    const part = rehearsalSectionFor(attachment);
    const key = part?.id ?? "__unassigned__";
    const existing = sections.get(key);
    if (existing) {
      existing.attachments.push(attachment);
    } else {
      sections.set(key, {
        part,
        attachments: [attachment],
        firstIndex: originalOrder.get(attachment.id) ?? 0,
      });
    }
  }

  const partSections = [...sections.values()]
    .sort(
      (left, right) =>
        partRank(left.part) - partRank(right.part) ||
        left.firstIndex - right.firstIndex ||
        (left.part?.id ?? "").localeCompare(right.part?.id ?? ""),
    )
    .map((section) => ({
      part: section.part,
      label: section.part?.name ?? "Unassigned",
      attachments: sortByManualOrder(section.attachments, originalOrder),
    }));

  return {
    ...definition,
    attachments: partSections.flatMap((section) => section.attachments),
    partSections,
  };
}

function isGeneralScoreOrDocument(
  attachment: PresentationAttachmentInput,
): boolean {
  if (attachment.parts.length > 0) return false;
  return !PART_SPECIFIC_PURPOSES.has(attachment.purpose);
}

/**
 * Applies the Member part-filter rule while preserving input order.
 * Unassigned score/document files are intentionally retained for every part.
 */
export function filterAttachmentsForPart(
  attachments: readonly PresentationAttachmentInput[],
  selectedPartId: string | null | undefined,
): PresentationAttachmentInput[] {
  if (!selectedPartId) return [...attachments];
  return attachments.filter(
    (attachment) =>
      attachment.parts.some((part) => part.id === selectedPartId) ||
      attachment.parts.some((part) => part.isAll) ||
      isGeneralScoreOrDocument(attachment),
  );
}

export function availableAttachmentPartFilters(
  attachments: readonly PresentationAttachmentInput[],
): PartFilter[] {
  const byId = new Map<string, PresentationPart>();
  for (const attachment of attachments) {
    for (const part of attachment.parts) {
      if (!part.isAll && !byId.has(part.id)) byId.set(part.id, part);
    }
  }
  return orderedParts([...byId.values()]).map(({ id, name }) => ({ id, name }));
}

/** Builds the complete pure Member attachment read/presentation model. */
export function createAttachmentPresentation(
  input: AttachmentPresentationInput,
): AttachmentPresentationModel {
  const selectedPartId = input.selectedPartId ?? null;
  const filtered = filterAttachmentsForPart(input.attachments, selectedPartId);
  const originalOrder = new Map(
    input.attachments.map((attachment, index) => [attachment.id, index]),
  );
  const presented = filtered.map((attachment) =>
    presentAttachment(input.piece, attachment),
  );
  const primaryIndex = presented.findIndex((attachment) => attachment.isPrimary);
  const primaryAttachment = primaryIndex >= 0 ? presented[primaryIndex] : null;
  const remaining = presented.filter((_, index) => index !== primaryIndex);
  const byGroup = new Map<AttachmentGroupKey, PresentedAttachment[]>();
  for (const attachment of remaining) {
    const key = groupForPurpose(attachment.purpose);
    const group = byGroup.get(key);
    if (group) group.push(attachment);
    else byGroup.set(key, [attachment]);
  }

  const groups = GROUPS.flatMap((definition) => {
    const attachments = byGroup.get(definition.key);
    return attachments?.length
      ? [buildGroup(definition, attachments, originalOrder)]
      : [];
  });

  return {
    primaryAction: primaryAttachment
      ? {
          kind: "openMainScore",
          label: "Open main score",
          attachment: primaryAttachment,
        }
      : null,
    groups,
    availablePartFilters: availableAttachmentPartFilters(input.attachments),
    selectedPartId,
  };
}
