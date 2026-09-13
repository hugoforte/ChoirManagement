import {
  classifyAttachment,
  filenamesCollide,
  generateStandardizedFilename,
  getAllowedPurposes,
  type AttachmentFormat,
  type AttachmentPurpose,
  type Confidence,
  type InferredValue,
  type VoicePart,
} from "./attachmentClassification";

/** Plain metadata from a picker/upload queue; deliberately not a browser File. */
export interface ReviewFile {
  id: string;
  name: string;
  size: number;
  /** Canonical SHA-256 hex when the upload queue has calculated it. */
  sha256?: string;
  /** Browser-detected media duration when available. */
  durationSeconds?: number;
}

export interface ExistingAttachmentForReview {
  id: string;
  filename: string;
  sha256?: string;
}

export interface PieceCreditsForReview {
  title: string;
  arranger?: string;
  composer?: string;
  hasPrimaryScore: boolean;
}

export interface AttachmentBatchReviewInput {
  piece: PieceCreditsForReview;
  voiceParts: readonly VoicePart[];
  files: readonly ReviewFile[];
  existingAttachments?: readonly ExistingAttachmentForReview[];
}

export type ExactDuplicateDecision = "skip" | "uploadAnyway";
export type NameCollisionDecision = "newVersion" | "rename" | "skip";

export interface ReviewCollisionMatch {
  kind: "existing" | "batch";
  filename: string;
  attachmentId?: string;
  rowId?: string;
}

export type ExactDuplicateMatch = ReviewCollisionMatch;
export type NameCollisionMatch = ReviewCollisionMatch;

export type ReviewValidationCode =
  | "invalidFile"
  | "missingFormat"
  | "missingPurpose"
  | "purposeNotAllowed"
  | "unknownVoicePart"
  | "duplicateVoicePart"
  | "allWithOtherParts"
  | "partRequired"
  | "missingFilename"
  | "ineligiblePrimary"
  | "exactDuplicate"
  | "nameCollision"
  | "invalidNewVersionTarget"
  | "noIncludedRows";

export interface ReviewValidationIssue {
  code: ReviewValidationCode;
  message: string;
}

export interface AttachmentReviewRow {
  id: string;
  originalFilename: string;
  size: number;
  sha256?: string;
  durationSeconds?: number;
  included: boolean;
  format: InferredValue<AttachmentFormat> | null;
  purpose: InferredValue<AttachmentPurpose> | null;
  voiceParts: InferredValue<string[]>;
  filename: InferredValue<string>;
  /** False only after the reviewer has explicitly supplied a filename. */
  filenameManuallyOverridden: boolean;
  isPrimary: boolean;
  /** Present only for an automatic or manually chosen primary row. */
  primaryMarker: "inferred" | "provided" | null;
  invalidFileMessage: string | null;
  exactDuplicates: readonly ExactDuplicateMatch[];
  exactDuplicateDecision: ExactDuplicateDecision | null;
  nameCollisions: readonly NameCollisionMatch[];
  nameCollisionDecision: NameCollisionDecision | null;
  /** Required when the name-collision decision is newVersion. */
  newVersionAttachmentId: string | null;
  validation: readonly ReviewValidationIssue[];
}

export interface AttachmentBatchReviewState {
  piece: PieceCreditsForReview;
  voiceParts: readonly VoicePart[];
  existingAttachments: readonly ExistingAttachmentForReview[];
  rows: readonly AttachmentReviewRow[];
}

function inferred<T>(value: T, confidence: Confidence): InferredValue<T> {
  return { value, confidence, inferred: true, marker: "inferred" };
}

function provided<T>(value: T): InferredValue<T> {
  return { value, confidence: "high", inferred: false, marker: "provided" };
}

function extensionOf(filename: string): string {
  return /\.([^.]+)$/u.exec(filename.trim())?.[1] ?? "";
}

function normalizedSha256(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{64}$/u.test(normalized) ? normalized : null;
}

function normalizedDuration(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function isPrimaryEligible(
  format: AttachmentFormat | null,
  purpose: AttachmentPurpose | null,
): boolean {
  return format === "pdf" && purpose === "fullScore";
}

function requiresVoicePart(purpose: AttachmentPurpose): boolean {
  return (
    purpose === "partScore" ||
    purpose === "editablePartScore" ||
    purpose === "partRehearsal"
  );
}

function generatedFilename(
  piece: PieceCreditsForReview,
  voiceParts: readonly VoicePart[],
  originalFilename: string,
  purpose: AttachmentPurpose,
  voicePartIds: readonly string[],
): string {
  return generateStandardizedFilename({
    title: piece.title,
    arranger: piece.arranger,
    composer: piece.composer,
    purpose,
    voicePartIds: [...voicePartIds],
    parts: [...voiceParts],
    extension: extensionOf(originalFilename),
  });
}

function makeRow(
  file: ReviewFile,
  piece: PieceCreditsForReview,
  voiceParts: readonly VoicePart[],
): AttachmentReviewRow {
  const classification = classifyAttachment(
    { name: file.name, size: file.size },
    [...voiceParts],
  );
  if (!classification.ok) {
    return {
      id: file.id,
      originalFilename: file.name,
      size: file.size,
      sha256: normalizedSha256(file.sha256) ?? undefined,
      durationSeconds: normalizedDuration(file.durationSeconds),
      included: true,
      format: null,
      purpose: null,
      voiceParts: inferred([], "low"),
      filename: provided(file.name),
      filenameManuallyOverridden: false,
      isPrimary: false,
      primaryMarker: null,
      invalidFileMessage: classification.message,
      exactDuplicates: [],
      exactDuplicateDecision: null,
      nameCollisions: [],
      nameCollisionDecision: null,
      newVersionAttachmentId: null,
      validation: [],
    };
  }
  const suggestion = classification.suggestion;
  return {
    id: file.id,
    originalFilename: file.name,
    size: file.size,
    sha256: normalizedSha256(file.sha256) ?? undefined,
    durationSeconds: normalizedDuration(file.durationSeconds),
    included: true,
    format: suggestion.format,
    purpose: suggestion.purpose,
    voiceParts: suggestion.voiceParts,
    filename: inferred(
      generatedFilename(
        piece,
        voiceParts,
        file.name,
        suggestion.purpose.value,
        suggestion.voiceParts.value,
      ),
      suggestion.confidence,
    ),
    filenameManuallyOverridden: false,
    isPrimary: false,
    primaryMarker: null,
    invalidFileMessage: null,
    exactDuplicates: [],
    exactDuplicateDecision: null,
    nameCollisions: [],
    nameCollisionDecision: null,
    newVersionAttachmentId: null,
    validation: [],
  };
}

function withGeneratedFilename(
  row: AttachmentReviewRow,
  piece: PieceCreditsForReview,
  voiceParts: readonly VoicePart[],
): AttachmentReviewRow {
  if (
    row.filenameManuallyOverridden ||
    !row.purpose ||
    row.filename.marker !== "inferred"
  ) {
    return row;
  }
  return {
    ...row,
    filename: inferred(
      generatedFilename(
        piece,
        voiceParts,
        row.originalFilename,
        row.purpose.value,
        row.voiceParts.value,
      ),
      row.purpose.confidence,
    ),
  };
}

function duplicateMatches(
  row: AttachmentReviewRow,
  allRows: readonly AttachmentReviewRow[],
  existingAttachments: readonly ExistingAttachmentForReview[],
): ExactDuplicateMatch[] {
  const sha256 = normalizedSha256(row.sha256);
  if (!sha256) return [];
  const existing = existingAttachments.flatMap((attachment) =>
    normalizedSha256(attachment.sha256) === sha256
      ? [{ kind: "existing" as const, filename: attachment.filename, attachmentId: attachment.id }]
      : [],
  );
  const batch = allRows.flatMap((candidate) =>
    candidate.id !== row.id &&
    candidate.included &&
    normalizedSha256(candidate.sha256) === sha256
      ? [{ kind: "batch" as const, filename: candidate.filename.value, rowId: candidate.id }]
      : [],
  );
  return [...existing, ...batch];
}

function collisionMatches(
  row: AttachmentReviewRow,
  allRows: readonly AttachmentReviewRow[],
  existingAttachments: readonly ExistingAttachmentForReview[],
): NameCollisionMatch[] {
  const filename = row.filename.value.trim();
  if (!filename) return [];
  const existing = existingAttachments.flatMap((attachment) =>
    filenamesCollide(filename, attachment.filename)
      ? [{ kind: "existing" as const, filename: attachment.filename, attachmentId: attachment.id }]
      : [],
  );
  const batch = allRows.flatMap((candidate) =>
    candidate.id !== row.id &&
    candidate.included &&
    filenamesCollide(filename, candidate.filename.value)
      ? [{ kind: "batch" as const, filename: candidate.filename.value, rowId: candidate.id }]
      : [],
  );
  return [...existing, ...batch];
}

function validateRow(
  row: AttachmentReviewRow,
  knownParts: readonly VoicePart[],
): ReviewValidationIssue[] {
  if (!row.included) return [];
  const issues: ReviewValidationIssue[] = [];
  if (row.invalidFileMessage) {
    issues.push({ code: "invalidFile", message: row.invalidFileMessage });
  }
  if (!row.format) issues.push({ code: "missingFormat", message: "Choose a file format." });
  if (!row.purpose) issues.push({ code: "missingPurpose", message: "Choose a file purpose." });
  if (row.format && row.purpose && !getAllowedPurposes(row.format.value).includes(row.purpose.value)) {
    issues.push({
      code: "purposeNotAllowed",
      message: "This purpose is not allowed for the selected file format.",
    });
  }
  const selected = row.voiceParts.value;
  const selectedSet = new Set(selected);
  if (selectedSet.size !== selected.length) {
    issues.push({ code: "duplicateVoicePart", message: "Voice parts cannot contain duplicates." });
  }
  const knownById = new Map(knownParts.map((part) => [part.id, part]));
  if (selected.some((id) => !knownById.has(id))) {
    issues.push({ code: "unknownVoicePart", message: "Choose only configured voice parts." });
  }
  const allCount = selected.filter((id) => knownById.get(id)?.isAll).length;
  if (allCount > 0 && selected.length > 1) {
    issues.push({ code: "allWithOtherParts", message: "All cannot be combined with individual voice parts." });
  }
  if (row.purpose && requiresVoicePart(row.purpose.value) && selected.length === 0) {
    issues.push({ code: "partRequired", message: "This purpose requires at least one voice part or All." });
  }
  if (!row.filename.value.trim()) {
    issues.push({ code: "missingFilename", message: "Enter a filename." });
  }
  if (row.isPrimary && !isPrimaryEligible(row.format?.value ?? null, row.purpose?.value ?? null)) {
    issues.push({ code: "ineligiblePrimary", message: "Only a full-score PDF can be primary." });
  }
  if (row.exactDuplicates.length > 0 && row.exactDuplicateDecision === null) {
    issues.push({
      code: "exactDuplicate",
      message: "Choose whether to skip this exact SHA-256 duplicate or upload it anyway.",
    });
  }
  if (row.nameCollisions.length > 0) {
    if (row.nameCollisionDecision === null) {
      issues.push({
        code: "nameCollision",
        message: "Choose whether to create a new version, rename, or skip this filename collision.",
      });
    } else if (row.nameCollisionDecision === "rename") {
      issues.push({ code: "nameCollision", message: "Choose a filename that does not collide." });
    } else if (row.nameCollisionDecision === "newVersion") {
      const matchesTarget = row.nameCollisions.some(
        (match) => match.kind === "existing" && match.attachmentId === row.newVersionAttachmentId,
      );
      if (!matchesTarget || row.nameCollisions.length !== 1) {
        issues.push({
          code: "invalidNewVersionTarget",
          message: "New version must target the one existing attachment with this filename.",
        });
      }
    }
  }
  return issues;
}

function recomputeDerivedReviewState(
  state: AttachmentBatchReviewState,
): AttachmentBatchReviewState {
  let rows = state.rows.map((row) => withGeneratedFilename(row, state.piece, state.voiceParts));
  let primaryAvailable = !state.piece.hasPrimaryScore;
  rows = rows.map((row) => {
    const canRemainPrimary =
      row.included &&
      isPrimaryEligible(row.format?.value ?? null, row.purpose?.value ?? null) &&
      primaryAvailable;
    if (row.isPrimary && canRemainPrimary) {
      primaryAvailable = false;
      return row;
    }
    return row.isPrimary || row.primaryMarker !== null
      ? { ...row, isPrimary: false, primaryMarker: null }
      : row;
  });
  rows = rows.map((row) => ({
    ...row,
    exactDuplicates: duplicateMatches(row, rows, state.existingAttachments),
    nameCollisions: collisionMatches(row, rows, state.existingAttachments),
  }));
  rows = rows.map((row) => ({ ...row, validation: validateRow(row, state.voiceParts) }));
  return { ...state, rows };
}

function suggestFirstPrimary(state: AttachmentBatchReviewState): AttachmentBatchReviewState {
  if (state.piece.hasPrimaryScore || state.rows.some((row) => row.isPrimary)) return state;
  const candidate = state.rows.find(
    (row) => row.included && isPrimaryEligible(row.format?.value ?? null, row.purpose?.value ?? null),
  );
  if (!candidate) return state;
  return {
    ...state,
    rows: state.rows.map((row) =>
      row.id === candidate.id
        ? { ...row, isPrimary: true, primaryMarker: "inferred" }
        : row,
    ),
  };
}

/** Creates a plain-data review state; it performs no upload or backend work. */
export function createAttachmentBatchReview(input: AttachmentBatchReviewInput): AttachmentBatchReviewState {
  const ids = new Set<string>();
  const rows = input.files.map((file) => {
    if (!file.id || ids.has(file.id)) throw new Error("Review file IDs must be unique and non-empty");
    ids.add(file.id);
    return makeRow(file, input.piece, input.voiceParts);
  });
  return recomputeDerivedReviewState(
    suggestFirstPrimary({
      piece: { ...input.piece },
      voiceParts: input.voiceParts.map((part) => ({ ...part })),
      existingAttachments: (input.existingAttachments ?? []).map((attachment) => ({ ...attachment })),
      rows,
    }),
  );
}

/** Adds picker metadata to an in-progress review without changing existing rows. */
export function addFilesToAttachmentBatchReview(
  state: AttachmentBatchReviewState,
  files: readonly ReviewFile[],
): AttachmentBatchReviewState {
  const ids = new Set(state.rows.map((row) => row.id));
  const newRows = files.map((file) => {
    if (!file.id || ids.has(file.id)) throw new Error("Review file IDs must be unique and non-empty");
    ids.add(file.id);
    return makeRow(file, state.piece, state.voiceParts);
  });
  return recomputeDerivedReviewState(
    suggestFirstPrimary({ ...state, rows: [...state.rows, ...newRows] }),
  );
}

function updateRow(
  state: AttachmentBatchReviewState,
  rowId: string,
  update: (row: AttachmentReviewRow) => AttachmentReviewRow,
): AttachmentBatchReviewState {
  return recomputeDerivedReviewState({
    ...state,
    rows: state.rows.map((row) => (row.id === rowId ? update(row) : row)),
  });
}

export function setReviewRowIncluded(
  state: AttachmentBatchReviewState,
  rowId: string,
  included: boolean,
): AttachmentBatchReviewState {
  return updateRow(state, rowId, (row) => ({
    ...row,
    included,
    isPrimary: included ? row.isPrimary : false,
    primaryMarker: included ? row.primaryMarker : null,
    exactDuplicateDecision: included && row.exactDuplicateDecision === "skip" ? null : row.exactDuplicateDecision,
    nameCollisionDecision: included && row.nameCollisionDecision === "skip" ? null : row.nameCollisionDecision,
  }));
}

export function setReviewRowFormat(
  state: AttachmentBatchReviewState,
  rowId: string,
  format: AttachmentFormat,
): AttachmentBatchReviewState {
  return updateRow(state, rowId, (row) => ({ ...row, format: provided(format) }));
}

export function setReviewRowPurpose(
  state: AttachmentBatchReviewState,
  rowId: string,
  purpose: AttachmentPurpose,
): AttachmentBatchReviewState {
  return updateRow(state, rowId, (row) => ({ ...row, purpose: provided(purpose) }));
}

export function setReviewRowVoiceParts(
  state: AttachmentBatchReviewState,
  rowId: string,
  voicePartIds: readonly string[],
): AttachmentBatchReviewState {
  return updateRow(state, rowId, (row) => ({ ...row, voiceParts: provided([...voicePartIds]) }));
}

export function setReviewRowFilename(
  state: AttachmentBatchReviewState,
  rowId: string,
  filename: string,
): AttachmentBatchReviewState {
  return updateRow(state, rowId, (row) => ({
    ...row,
    filename: provided(filename),
    filenameManuallyOverridden: true,
  }));
}

export function setReviewRowDuration(
  state: AttachmentBatchReviewState,
  rowId: string,
  durationSeconds: number | undefined,
): AttachmentBatchReviewState {
  return updateRow(state, rowId, (row) => ({
    ...row,
    durationSeconds: normalizedDuration(durationSeconds),
  }));
}

export function resetReviewRowFilename(
  state: AttachmentBatchReviewState,
  rowId: string,
): AttachmentBatchReviewState {
  return updateRow(state, rowId, (row) => ({
    ...row,
    filename: inferred("", row.purpose?.confidence ?? "low"),
    filenameManuallyOverridden: false,
  }));
}

export function setReviewRowPrimary(
  state: AttachmentBatchReviewState,
  rowId: string,
  isPrimary: boolean,
): AttachmentBatchReviewState {
  const target = state.rows.find((row) => row.id === rowId);
  const eligible = isPrimary && !state.piece.hasPrimaryScore && Boolean(target) && isPrimaryEligible(target?.format?.value ?? null, target?.purpose?.value ?? null);
  if (!isPrimary || !eligible) {
    return updateRow(state, rowId, (row) => ({
      ...row,
      isPrimary: false,
      primaryMarker: null,
    }));
  }
  return recomputeDerivedReviewState({
    ...state,
    rows: state.rows.map((row) =>
      row.id === rowId
        ? { ...row, included: true, isPrimary: true, primaryMarker: "provided" }
        : { ...row, isPrimary: false, primaryMarker: null },
    ),
  });
}

export function setReviewRowExactDuplicateDecision(
  state: AttachmentBatchReviewState,
  rowId: string,
  decision: ExactDuplicateDecision | null,
): AttachmentBatchReviewState {
  return updateRow(state, rowId, (row) => ({
    ...row,
    exactDuplicateDecision: decision,
    included: decision === "skip" ? false : row.included,
    isPrimary: decision === "skip" ? false : row.isPrimary,
    primaryMarker: decision === "skip" ? null : row.primaryMarker,
  }));
}

export function setReviewRowNameCollisionDecision(
  state: AttachmentBatchReviewState,
  rowId: string,
  decision: NameCollisionDecision | null,
  newVersionAttachmentId: string | null = null,
): AttachmentBatchReviewState {
  return updateRow(state, rowId, (row) => ({
    ...row,
    nameCollisionDecision: decision,
    newVersionAttachmentId: decision === "newVersion" ? newVersionAttachmentId : null,
    included: decision === "skip" ? false : row.included,
    isPrimary: decision === "skip" ? false : row.isPrimary,
    primaryMarker: decision === "skip" ? null : row.primaryMarker,
  }));
}

export function setAttachmentBatchReviewCredits(
  state: AttachmentBatchReviewState,
  changes: Partial<Pick<PieceCreditsForReview, "title" | "arranger" | "composer">>,
): AttachmentBatchReviewState {
  return recomputeDerivedReviewState({
    ...state,
    piece: { ...state.piece, ...changes },
  });
}

export function bulkSetReviewRowPurpose(
  state: AttachmentBatchReviewState,
  rowIds: readonly string[],
  purpose: AttachmentPurpose,
): AttachmentBatchReviewState {
  const selected = new Set(rowIds);
  return recomputeDerivedReviewState({
    ...state,
    rows: state.rows.map((row) => (selected.has(row.id) ? { ...row, purpose: provided(purpose) } : row)),
  });
}

export function bulkSetReviewRowVoiceParts(
  state: AttachmentBatchReviewState,
  rowIds: readonly string[],
  voicePartIds: readonly string[],
): AttachmentBatchReviewState {
  const selected = new Set(rowIds);
  return recomputeDerivedReviewState({
    ...state,
    rows: state.rows.map((row) =>
      selected.has(row.id) ? { ...row, voiceParts: provided([...voicePartIds]) } : row,
    ),
  });
}

export function validateAttachmentBatchReview(state: AttachmentBatchReviewState): readonly ReviewValidationIssue[] {
  const rowIssues = state.rows.flatMap((row) => row.validation);
  return state.rows.some((row) => row.included)
    ? rowIssues
    : [...rowIssues, { code: "noIncludedRows", message: "Include at least one file before finishing." }];
}

export function canPublishAttachmentBatchReview(state: AttachmentBatchReviewState): boolean {
  return validateAttachmentBatchReview(state).length === 0;
}
