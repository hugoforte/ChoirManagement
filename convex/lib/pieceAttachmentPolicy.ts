import { Infer, v } from "convex/values";

export const attachmentFormatValidator = v.union(
  v.literal("pdf"),
  v.literal("musescore"),
  v.literal("musicxml"),
  v.literal("midi"),
  v.literal("audio"),
  v.literal("image"),
  v.literal("other"),
);

export type AttachmentFormat = Infer<typeof attachmentFormatValidator>;

export const attachmentPurposeValidator = v.union(
  v.literal("fullScore"),
  v.literal("partScore"),
  v.literal("accompanimentScore"),
  v.literal("lyricsText"),
  v.literal("pronunciation"),
  v.literal("editableFullScore"),
  v.literal("editablePartScore"),
  v.literal("fullMix"),
  v.literal("partRehearsal"),
  v.literal("accompaniment"),
  v.literal("referencePerformance"),
  v.literal("other"),
);

export type AttachmentPurpose = Infer<typeof attachmentPurposeValidator>;

export const attachmentStatusValidator = v.union(
  v.literal("active"),
  v.literal("recycled"),
);
export const voicePartStatusValidator = v.union(
  v.literal("active"),
  v.literal("archived"),
);

export const defaultVoicePartKeyValidator = v.union(
  v.literal("all"),
  v.literal("soprano"),
  v.literal("alto"),
  v.literal("tenor"),
  v.literal("bass"),
);

export type DefaultVoicePartKey = Infer<typeof defaultVoicePartKeyValidator>;

export const DEFAULT_VOICE_PARTS = [
  {
    defaultKey: "all",
    name: "All",
    normalizedName: "all",
    displayOrder: 0,
    isAll: true,
  },
  {
    defaultKey: "soprano",
    name: "Soprano",
    normalizedName: "soprano",
    displayOrder: 1,
    isAll: false,
  },
  {
    defaultKey: "alto",
    name: "Alto",
    normalizedName: "alto",
    displayOrder: 2,
    isAll: false,
  },
  {
    defaultKey: "tenor",
    name: "Tenor",
    normalizedName: "tenor",
    displayOrder: 3,
    isAll: false,
  },
  {
    defaultKey: "bass",
    name: "Bass",
    normalizedName: "bass",
    displayOrder: 4,
    isAll: false,
  },
] as const satisfies ReadonlyArray<{
  defaultKey: DefaultVoicePartKey;
  name: string;
  normalizedName: string;
  displayOrder: number;
  isAll: boolean;
}>;

const PURPOSES_BY_FORMAT: Record<
  AttachmentFormat,
  readonly AttachmentPurpose[]
> = {
  pdf: [
    "fullScore",
    "partScore",
    "accompanimentScore",
    "lyricsText",
    "pronunciation",
    "other",
  ],
  image: [
    "fullScore",
    "partScore",
    "accompanimentScore",
    "lyricsText",
    "pronunciation",
    "other",
  ],
  other: [
    "fullScore",
    "partScore",
    "accompanimentScore",
    "lyricsText",
    "pronunciation",
    "other",
  ],
  musescore: ["editableFullScore", "editablePartScore", "other"],
  musicxml: ["editableFullScore", "editablePartScore", "other"],
  midi: [
    "fullMix",
    "partRehearsal",
    "accompaniment",
    "referencePerformance",
    "pronunciation",
    "other",
  ],
  audio: [
    "fullMix",
    "partRehearsal",
    "accompaniment",
    "referencePerformance",
    "pronunciation",
    "other",
  ],
};

export function isPurposeAllowedForFormat(
  format: AttachmentFormat,
  purpose: AttachmentPurpose,
): boolean {
  return PURPOSES_BY_FORMAT[format].includes(purpose);
}

export function requirePurposeAllowedForFormat(
  format: AttachmentFormat,
  purpose: AttachmentPurpose,
): void {
  if (!isPurposeAllowedForFormat(format, purpose)) {
    throw new Error(`Purpose ${purpose} is not allowed for format ${format}`);
  }
}

export function purposeRequiresVoicePart(purpose: AttachmentPurpose): boolean {
  return (
    purpose === "partScore" ||
    purpose === "editablePartScore" ||
    purpose === "partRehearsal"
  );
}

export type VoicePartSelection = ReadonlyArray<{ id: string; isAll: boolean }>;

export function requireValidVoicePartSelection(
  purpose: AttachmentPurpose,
  selectedParts: VoicePartSelection,
): void {
  const uniqueIds = new Set(selectedParts.map((part) => part.id));
  if (uniqueIds.size !== selectedParts.length) {
    throw new Error("Voice parts cannot contain duplicates");
  }

  const allCount = selectedParts.filter((part) => part.isAll).length;
  if (allCount > 1 || (allCount === 1 && selectedParts.length > 1)) {
    throw new Error("All cannot be combined with individual voice parts");
  }

  if (purposeRequiresVoicePart(purpose) && selectedParts.length === 0) {
    throw new Error(
      `Purpose ${purpose} requires at least one voice part or All`,
    );
  }
}

export function isPrimaryScoreEligible(
  format: AttachmentFormat,
  purpose: AttachmentPurpose,
): boolean {
  return format === "pdf" && purpose === "fullScore";
}

export function requirePrimaryScoreEligible(
  format: AttachmentFormat,
  purpose: AttachmentPurpose,
): void {
  if (!isPrimaryScoreEligible(format, purpose)) {
    throw new Error("Only a full-score PDF can be the primary score");
  }
}

export function requireCurrentRevisionBelongsToAttachment(
  attachmentId: string,
  currentVersion: { attachmentId: string } | null,
): void {
  if (!currentVersion) {
    throw new Error("Attachment has no current revision");
  }
  if (currentVersion.attachmentId !== attachmentId) {
    throw new Error("Current revision belongs to another attachment");
  }
}
