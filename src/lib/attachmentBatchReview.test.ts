import { describe, expect, it } from "vitest";

import {
  addFilesToAttachmentBatchReview,
  bulkSetReviewRowPurpose,
  bulkSetReviewRowVoiceParts,
  canPublishAttachmentBatchReview,
  createAttachmentBatchReview,
  resetReviewRowFilename,
  setAttachmentBatchReviewCredits,
  setReviewRowExactDuplicateDecision,
  setReviewRowFilename,
  setReviewRowDuration,
  setReviewRowIncluded,
  setReviewRowNameCollisionDecision,
  setReviewRowPrimary,
  setReviewRowPurpose,
  setReviewRowVoiceParts,
  validateAttachmentBatchReview,
  type AttachmentBatchReviewInput,
} from "./attachmentBatchReview";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

const input = (overrides: Partial<AttachmentBatchReviewInput> = {}): AttachmentBatchReviewInput => ({
  piece: { title: "Hallelujah", arranger: "Handel", hasPrimaryScore: false },
  voiceParts: [
    { id: "all", name: "All", displayOrder: 0, isAll: true },
    { id: "s", name: "Soprano", displayOrder: 1 },
    { id: "a", name: "Alto", displayOrder: 2 },
    { id: "t", name: "Tenor", displayOrder: 3 },
    { id: "b", name: "Bass", displayOrder: 4 },
  ],
  files: [
    { id: "pdf", name: "Hallelujah score.pdf", size: 100, sha256: SHA_A },
    { id: "tenor", name: "Hallelujah tenor.mp3", size: 200, sha256: SHA_B },
    { id: "source", name: "Hallelujah.mscz", size: 300 },
  ],
  ...overrides,
});

function row(state: ReturnType<typeof createAttachmentBatchReview>, id: string) {
  const value = state.rows.find((candidate) => candidate.id === id);
  if (!value) throw new Error(`Missing test row ${id}`);
  return value;
}

describe("attachment batch review creation", () => {
  it("creates inferred editable review rows and suggests the first eligible primary PDF", () => {
    const state = createAttachmentBatchReview(input());
    expect(row(state, "pdf")).toMatchObject({
      format: { value: "pdf", marker: "inferred" },
      purpose: { value: "fullScore", marker: "inferred" },
      filename: { value: "Hallelujah - Handel - Full Score.pdf", marker: "inferred" },
      isPrimary: true,
      primaryMarker: "inferred",
    });
    expect(row(state, "tenor")).toMatchObject({
      purpose: { value: "partRehearsal" },
      voiceParts: { value: ["t"], marker: "inferred" },
    });
    expect(row(state, "source")).toMatchObject({
      format: { value: "musescore" },
      purpose: { value: "editableFullScore" },
    });
    expect(canPublishAttachmentBatchReview(state)).toBe(true);
  });

  it("does not suggest a primary if the Piece already has one", () => {
    const state = createAttachmentBatchReview(
      input({ piece: { title: "Hallelujah", hasPrimaryScore: true } }),
    );
    expect(state.rows.some((candidate) => candidate.isPrimary)).toBe(false);
  });

  it("keeps invalid files visible with a blocking explanation", () => {
    const state = createAttachmentBatchReview(
      input({ files: [{ id: "bad", name: "installer.exe", size: 1 }] }),
    );
    expect(row(state, "bad").validation).toEqual([
      expect.objectContaining({ code: "invalidFile" }),
      expect.objectContaining({ code: "missingFormat" }),
      expect.objectContaining({ code: "missingPurpose" }),
    ]);
    expect(canPublishAttachmentBatchReview(state)).toBe(false);
  });
});

describe("review edits and validation", () => {
  it("preserves an optional detected duration and allows correction", () => {
    let state = createAttachmentBatchReview(
      input({
        files: [
          {
            id: "audio",
            name: "Hallelujah tenor.mp3",
            size: 200,
            durationSeconds: 42.5,
          },
        ],
      }),
    );
    expect(row(state, "audio").durationSeconds).toBe(42.5);
    state = setReviewRowDuration(state, "audio", 43);
    expect(row(state, "audio").durationSeconds).toBe(43);
    state = setReviewRowDuration(state, "audio", 0);
    expect(row(state, "audio").durationSeconds).toBeUndefined();
  });

  it("clears an inferred primary as soon as its purpose becomes ineligible", () => {
    let state = createAttachmentBatchReview(input());
    state = setReviewRowPurpose(state, "pdf", "partScore");
    expect(row(state, "pdf")).toMatchObject({ isPrimary: false, primaryMarker: null });
    expect(row(state, "pdf").purpose).toMatchObject({ value: "partScore", marker: "provided" });
    expect(row(state, "pdf").validation).toContainEqual(
      expect.objectContaining({ code: "partRequired" }),
    );
  });

  it("allows a manual primary choice only for an eligible included row and clears other choices", () => {
    let state = createAttachmentBatchReview(input());
    state = setReviewRowPrimary(state, "source", true);
    expect(row(state, "source").isPrimary).toBe(false);
    expect(row(state, "pdf").isPrimary).toBe(true);
    state = setReviewRowPrimary(state, "pdf", true);
    expect(row(state, "pdf")).toMatchObject({ isPrimary: true, primaryMarker: "provided" });
  });

  it("applies the part rules as row validation without silently changing selections", () => {
    let state = createAttachmentBatchReview(input());
    state = setReviewRowVoiceParts(state, "tenor", ["all", "t", "t", "missing"]);
    expect(row(state, "tenor").validation.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["duplicateVoicePart", "unknownVoicePart", "allWithOtherParts"]),
    );
    state = setReviewRowVoiceParts(state, "tenor", []);
    expect(row(state, "tenor").validation).toContainEqual(
      expect.objectContaining({ code: "partRequired" }),
    );
  });

  it("does not let skipped invalid rows block finish and requires an included row", () => {
    let state = createAttachmentBatchReview(
      input({ files: [{ id: "bad", name: "installer.exe", size: 1 }] }),
    );
    state = setReviewRowIncluded(state, "bad", false);
    expect(validateAttachmentBatchReview(state)).toContainEqual(
      expect.objectContaining({ message: "Include at least one file before finishing." }),
    );
    expect(canPublishAttachmentBatchReview(state)).toBe(false);
    state = addFilesToAttachmentBatchReview(state, [{ id: "good", name: "good.pdf", size: 1 }]);
    expect(canPublishAttachmentBatchReview(state)).toBe(true);
  });
});

describe("filenames and bulk edits", () => {
  it("keeps manual filename overrides stable across metadata and bulk edits", () => {
    let state = createAttachmentBatchReview(input());
    state = setReviewRowFilename(state, "pdf", "committee-copy.pdf");
    state = setAttachmentBatchReviewCredits(state, { title: "New Hallelujah", arranger: "Someone" });
    state = bulkSetReviewRowPurpose(state, ["pdf", "tenor"], "other");
    expect(row(state, "pdf").filename).toMatchObject({
      value: "committee-copy.pdf",
      marker: "provided",
    });
    expect(row(state, "pdf").filenameManuallyOverridden).toBe(true);
  });

  it("restarts automatic naming only when explicitly reset", () => {
    let state = createAttachmentBatchReview(input());
    state = setReviewRowFilename(state, "pdf", "committee-copy.pdf");
    state = resetReviewRowFilename(state, "pdf");
    expect(row(state, "pdf").filename).toMatchObject({
      value: "Hallelujah - Handel - Full Score.pdf",
      marker: "inferred",
    });
    state = setAttachmentBatchReviewCredits(state, { arranger: "Mozart" });
    expect(row(state, "pdf").filename.value).toBe("Hallelujah - Mozart - Full Score.pdf");
  });

  it("makes bulk purpose and part edits provided values for only the selected rows", () => {
    let state = createAttachmentBatchReview(input());
    state = bulkSetReviewRowPurpose(state, ["pdf", "source"], "other");
    state = bulkSetReviewRowVoiceParts(state, ["pdf", "source"], ["all"]);
    for (const id of ["pdf", "source"]) {
      expect(row(state, id)).toMatchObject({
        purpose: { value: "other", marker: "provided" },
        voiceParts: { value: ["all"], marker: "provided" },
      });
    }
    expect(row(state, "tenor").voiceParts.value).toEqual(["t"]);
  });
});

describe("duplicate and collision decisions", () => {
  it("requires an explicit exact-hash decision, then supports skip and upload anyway", () => {
    let state = createAttachmentBatchReview(
      input({
        existingAttachments: [{ id: "old", filename: "Old score.pdf", sha256: SHA_A }],
      }),
    );
    expect(row(state, "pdf").exactDuplicates).toEqual([
      expect.objectContaining({ kind: "existing", attachmentId: "old" }),
    ]);
    expect(row(state, "pdf").validation).toContainEqual(
      expect.objectContaining({ code: "exactDuplicate" }),
    );
    state = setReviewRowExactDuplicateDecision(state, "pdf", "uploadAnyway");
    expect(row(state, "pdf").validation).not.toContainEqual(
      expect.objectContaining({ code: "exactDuplicate" }),
    );
    state = setReviewRowExactDuplicateDecision(state, "pdf", "skip");
    expect(row(state, "pdf")).toMatchObject({ included: false, isPrimary: false });
  });

  it("detects exact duplicates within an included batch", () => {
    const state = createAttachmentBatchReview(
      input({
        files: [
          { id: "one", name: "one.pdf", size: 1, sha256: SHA_A },
          { id: "two", name: "two.pdf", size: 1, sha256: SHA_A.toUpperCase() },
        ],
      }),
    );
    expect(row(state, "one").exactDuplicates).toContainEqual(
      expect.objectContaining({ kind: "batch", rowId: "two" }),
    );
    expect(row(state, "two").exactDuplicates).toContainEqual(
      expect.objectContaining({ kind: "batch", rowId: "one" }),
    );
  });

  it("requires an explicit filename-collision decision and validates new-version targets", () => {
    let state = createAttachmentBatchReview(
      input({
        existingAttachments: [{ id: "old", filename: "Hallelujah - Handel - Full Score.pdf" }],
      }),
    );
    expect(row(state, "pdf").validation).toContainEqual(
      expect.objectContaining({ code: "nameCollision" }),
    );
    state = setReviewRowNameCollisionDecision(state, "pdf", "newVersion", "wrong");
    expect(row(state, "pdf").validation).toContainEqual(
      expect.objectContaining({ code: "invalidNewVersionTarget" }),
    );
    state = setReviewRowNameCollisionDecision(state, "pdf", "newVersion", "old");
    expect(row(state, "pdf").validation).not.toContainEqual(
      expect.objectContaining({ code: "nameCollision" }),
    );
    expect(row(state, "pdf").validation).not.toContainEqual(
      expect.objectContaining({ code: "invalidNewVersionTarget" }),
    );
  });

  it("keeps rename unresolved until the reviewer supplies a non-colliding filename, and supports skip", () => {
    let state = createAttachmentBatchReview(
      input({
        existingAttachments: [{ id: "old", filename: "Hallelujah - Handel - Full Score.pdf" }],
      }),
    );
    state = setReviewRowNameCollisionDecision(state, "pdf", "rename");
    expect(row(state, "pdf").validation).toContainEqual(
      expect.objectContaining({ code: "nameCollision" }),
    );
    state = setReviewRowFilename(state, "pdf", "Hallelujah revision.pdf");
    expect(row(state, "pdf").nameCollisions).toEqual([]);
    expect(row(state, "pdf").validation).not.toContainEqual(
      expect.objectContaining({ code: "nameCollision" }),
    );
    state = setReviewRowNameCollisionDecision(state, "tenor", "skip");
    expect(row(state, "tenor").included).toBe(false);
  });
});
