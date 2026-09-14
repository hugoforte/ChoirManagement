export type AttachmentFormat =
  "pdf" | "musescore" | "musicxml" | "midi" | "audio" | "image" | "other";

export type AttachmentPurpose =
  | "fullScore"
  | "partScore"
  | "accompanimentScore"
  | "lyricsText"
  | "pronunciation"
  | "editableFullScore"
  | "editablePartScore"
  | "fullMix"
  | "partRehearsal"
  | "accompaniment"
  | "referencePerformance"
  | "other";

export interface VoicePart {
  id: string;
  name: string;
  displayOrder: number;
  isAll?: boolean;
}

export interface FileDescriptor {
  name: string;
  size: number;
}

export type Confidence = "high" | "medium" | "low";

export interface InferredValue<T> {
  value: T;
  inferred: boolean;
  confidence: Confidence;
  marker: "inferred" | "provided";
}

export interface AttachmentSuggestion {
  format: InferredValue<AttachmentFormat>;
  purpose: InferredValue<AttachmentPurpose>;
  voiceParts: InferredValue<string[]>;
  confidence: Confidence;
  filename: InferredValue<string>;
}

export type ClassificationResult =
  | { ok: true; suggestion: AttachmentSuggestion }
  | { ok: false; reason: "empty" | "executable"; message: string };

export const PURPOSE_LABELS: Record<AttachmentPurpose, string> = {
  fullScore: "Full Score",
  partScore: "Part Score",
  accompanimentScore: "Accompaniment Score",
  lyricsText: "Lyrics Text",
  pronunciation: "Pronunciation",
  editableFullScore: "Editable Full Score",
  editablePartScore: "Editable Part Score",
  fullMix: "Full Mix",
  partRehearsal: "Part Rehearsal",
  accompaniment: "Accompaniment",
  referencePerformance: "Reference Performance",
  other: "Other",
};

const ALLOWED_PURPOSES: Record<AttachmentFormat, AttachmentPurpose[]> = {
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

const FORMAT_BY_EXTENSION: Record<string, AttachmentFormat> = {
  pdf: "pdf",
  mscz: "musescore",
  mscx: "musescore",
  musicxml: "musicxml",
  xml: "musicxml",
  mxl: "musicxml",
  mid: "midi",
  midi: "midi",
  mp3: "audio",
  m4a: "audio",
  wav: "audio",
  ogg: "audio",
  flac: "audio",
  aac: "audio",
  webm: "audio",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  svg: "image",
  bmp: "image",
};

const EXECUTABLE_EXTENSIONS = new Set([
  "exe",
  "com",
  "bat",
  "cmd",
  "msi",
  "dll",
  "scr",
  "ps1",
  "vbs",
  "js",
  "jar",
  "sh",
  "app",
  "dmg",
]);

const PURPOSE_TOKENS: Array<[AttachmentPurpose, string[]]> = [
  ["pronunciation", ["pronunciation", "pronounce", "diction"]],
  ["lyricsText", ["lyrics", "lyric", "text"]],
  ["accompanimentScore", ["accompaniment", "accomp", "piano", "keyboard"]],
  ["partRehearsal", ["rehearsal", "practice", "part"]],
  ["accompaniment", ["accompaniment", "accomp", "piano", "keyboard"]],
  ["referencePerformance", ["reference", "performance", "recording", "demo"]],
  ["fullMix", ["fullmix", "full", "mix"]],
  ["partScore", ["part", "voice"]],
  ["fullScore", ["fullscore", "score"]],
];

function tokensOf(name: string): string[] {
  return name
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
}

function suggestion<T>(
  value: T,
  confidence: Confidence,
  inferred = true,
): InferredValue<T> {
  return {
    value,
    inferred,
    confidence,
    marker: inferred ? "inferred" : "provided",
  };
}

function extensionOf(name: string): string {
  const match = /\.([^.]+)$/u.exec(name.trim().toLowerCase());
  return match?.[1] ?? "";
}

function inferPurpose(
  format: AttachmentFormat,
  tokens: string[],
  hasIndividualPart: boolean,
): [AttachmentPurpose, Confidence] {
  const hasPartToken =
    tokens.includes("part") || tokens.includes("voice") || hasIndividualPart;
  if (format === "musescore" || format === "musicxml") {
    if (hasPartToken) return ["editablePartScore", "high"];
    const hasFullScoreToken = tokens.some((token) =>
      ["editable", "edit", "fullscore", "score"].includes(token),
    );
    return ["editableFullScore", hasFullScoreToken ? "high" : "low"];
  }
  for (const [purpose, candidates] of PURPOSE_TOKENS) {
    if (
      ALLOWED_PURPOSES[format].includes(purpose) &&
      candidates.some((token) => tokens.includes(token))
    ) {
      return [purpose, "high"];
    }
  }
  if ((format === "audio" || format === "midi") && hasPartToken)
    return ["partRehearsal", "high"];
  if (
    (format === "pdf" || format === "image" || format === "other") &&
    hasPartToken
  )
    return ["partScore", "high"];
  if (format === "other") return ["other", "low"];
  return [ALLOWED_PURPOSES[format][0] ?? "other", "low"];
}

function inferParts(
  name: string,
  tokens: string[],
  configuredParts: VoicePart[],
): [string[], Confidence] {
  const rawTokens: string[] = Array.from(
    name.normalize("NFKC").match(/[\p{Letter}\p{Number}]+/gu) ?? [],
  );
  const tokenSet = new Set(tokens);
  const satbAliases: Record<string, readonly string[]> = {
    soprano: ["sop", "soprano"],
    alto: ["alt", "alto"],
    tenor: ["ten", "tenor"],
    bass: ["bas", "bass"],
  };
  const singleLetterAliases: Record<string, string> = {
    soprano: "S",
    alto: "A",
    tenor: "T",
    bass: "B",
  };
  const includesTokenSequence = (sequence: string[]) =>
    sequence.length > 0 &&
    tokens.some((_, start) =>
      sequence.every((token, offset) => tokens[start + offset] === token),
    );
  const matches = configuredParts.filter((part) => {
    const nameTokens = tokensOf(part.name);
    const canonicalName = nameTokens.at(-1) ?? "";
    if (part.isAll || canonicalName === "all") {
      return (
        tokenSet.has("all") ||
        tokenSet.has("satb") ||
        rawTokens.includes("SATB")
      );
    }
    const fullNameMatches = includesTokenSequence(nameTokens);
    const aliases = satbAliases[canonicalName] ?? [];
    const singleLetter = singleLetterAliases[canonicalName];
    return (
      fullNameMatches ||
      aliases.some((alias) => tokenSet.has(alias)) ||
      (singleLetter !== undefined && rawTokens.includes(singleLetter))
    );
  });
  const all = matches.find(
    (part) => part.isAll || part.name.toLowerCase() === "all",
  );
  const selected = all ? [all] : matches;
  return [
    selected
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((part) => part.id),
    selected.length ? "high" : "low",
  ];
}

export function getAllowedPurposes(
  format: AttachmentFormat,
): readonly AttachmentPurpose[] {
  return [...ALLOWED_PURPOSES[format]];
}

export function classifyAttachment(
  file: FileDescriptor,
  configuredParts: VoicePart[],
): ClassificationResult {
  if (file.size <= 0)
    return {
      ok: false,
      reason: "empty",
      message: "The selected file is empty.",
    };
  const extension = extensionOf(file.name);
  if (EXECUTABLE_EXTENSIONS.has(extension))
    return {
      ok: false,
      reason: "executable",
      message: "Executable files are not allowed.",
    };
  const format = FORMAT_BY_EXTENSION[extension] ?? "other";
  const stem = file.name.replace(/\.[^.]+$/u, "");
  const tokens = tokensOf(stem);
  const [voicePartIds, partConfidence] = inferParts(
    stem,
    tokens,
    configuredParts,
  );
  const selectedPartIds = new Set(voicePartIds);
  const hasIndividualPart = configuredParts.some(
    (part) => selectedPartIds.has(part.id) && !part.isAll,
  );
  const [purpose, purposeConfidence] = inferPurpose(
    format,
    tokens,
    hasIndividualPart,
  );
  const formatConfidence: Confidence = FORMAT_BY_EXTENSION[extension]
    ? "high"
    : "medium";
  const confidenceValues = [formatConfidence, purposeConfidence];
  if (
    purpose === "partScore" ||
    purpose === "editablePartScore" ||
    purpose === "partRehearsal"
  ) {
    confidenceValues.push(partConfidence);
  }
  const confidence: Confidence = confidenceValues.includes("low")
    ? "low"
    : confidenceValues.every((value) => value === "high")
      ? "high"
      : "medium";
  return {
    ok: true,
    suggestion: {
      format: suggestion(format, formatConfidence),
      purpose: suggestion(purpose, purposeConfidence),
      voiceParts: suggestion(voicePartIds, partConfidence),
      confidence,
      filename: suggestion(file.name, "high", false),
    },
  };
}

export interface StandardizedFilenameInput {
  title: string;
  arranger?: string;
  composer?: string;
  purpose: AttachmentPurpose;
  voicePartIds: string[];
  parts: VoicePart[];
  extension: string;
}

export function sanitizeFilenameSegment(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[']/gu, "")
    .replace(/[\\/:*?"<>|]+/gu, " ")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "")
    .trim();
}

export function generateStandardizedFilename(
  input: StandardizedFilenameInput,
): string {
  const selected = input.parts.filter((part) =>
    input.voicePartIds.includes(part.id),
  );
  const all = selected.find(
    (part) => part.isAll || part.name.toLowerCase() === "all",
  );
  const partNames = (
    all ? [all] : selected.sort((a, b) => a.displayOrder - b.displayOrder)
  )
    .map((part) => sanitizeFilenameSegment(part.name))
    .filter(Boolean);
  const segments = [
    sanitizeFilenameSegment(input.title),
    sanitizeFilenameSegment(input.arranger || input.composer || ""),
    PURPOSE_LABELS[input.purpose],
    partNames.join("-"),
  ].filter(Boolean);
  const extension = input.extension
    .replace(/^\./u, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "");
  return `${segments.join(" - ")}${extension ? `.${extension}` : ""}`;
}

export function filenamesCollide(left: string, right: string): boolean {
  const normalize = (filename: string) => {
    const rawExtension = extensionOf(filename);
    const extension = rawExtension.replace(/[^a-z0-9]+/gu, "");
    const stem = rawExtension
      ? filename.slice(0, -(rawExtension.length + 1))
      : filename;
    const normalizedStem = sanitizeFilenameSegment(stem).toLocaleLowerCase();
    return `${normalizedStem}${extension ? `.${extension}` : ""}`;
  };
  return normalize(left) === normalize(right);
}

export interface AttachmentNameState extends StandardizedFilenameInput {
  filename: string;
  manuallyOverridden: boolean;
  onPieceCreditsChanged: (
    changes: Partial<
      Pick<StandardizedFilenameInput, "title" | "arranger" | "composer">
    >,
  ) => AttachmentNameState;
  override: (filename: string) => AttachmentNameState;
}

export function createAttachmentNameState(
  input: StandardizedFilenameInput,
  manuallyOverridden = false,
  filename?: string,
): AttachmentNameState {
  const currentFilename = filename ?? generateStandardizedFilename(input);
  return {
    ...input,
    filename: currentFilename,
    manuallyOverridden,
    onPieceCreditsChanged: (changes) =>
      createAttachmentNameState(
        { ...input, ...changes },
        manuallyOverridden,
        manuallyOverridden ? currentFilename : undefined,
      ),
    override: (nextFilename) =>
      createAttachmentNameState(input, true, nextFilename),
  };
}
