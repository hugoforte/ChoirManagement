import { describe, expect, it } from "vitest";
import {
  classifyAttachment,
  createAttachmentNameState,
  filenamesCollide,
  generateStandardizedFilename,
  getAllowedPurposes,
  sanitizeFilenameSegment,
  type AttachmentPurpose,
  type VoicePart,
} from "./attachmentClassification";

const parts: VoicePart[] = [
  { id: "all", name: "All", displayOrder: 0, isAll: true },
  { id: "s", name: "Soprano", displayOrder: 1 },
  { id: "a", name: "Alto", displayOrder: 2 },
  { id: "t", name: "Tenor", displayOrder: 3 },
  { id: "b", name: "Bass", displayOrder: 4 },
];

describe("classifyAttachment", () => {
  it.each([
    ["Abide.mscz", "musescore"],
    ["Abide.musicxml", "musicxml"],
    ["Abide.mxl", "musicxml"],
    ["Abide.mid", "midi"],
    ["Abide.mp3", "audio"],
    ["Abide.wav", "audio"],
    ["Abide.png", "image"],
    ["Abide.pdf", "pdf"],
    ["Abide.docx", "other"],
  ] as const)("infers %s as %s", (name, format) => {
    const result = classifyAttachment({ name, size: 100 }, parts);
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.suggestion.format).toMatchObject({
        value: format,
        inferred: true,
      });
  });

  it.each([
    ["empty.pdf", 0, "empty"],
    ["virus.exe", 100, "executable"],
  ] as const)("rejects %s", (name, size, reason) => {
    const result = classifyAttachment({ name, size }, parts);
    expect(result).toMatchObject({ ok: false, reason });
  });

  it("infers pronunciation and SATB parts with visible confidence markers", () => {
    const result = classifyAttachment(
      { name: "Hallelujah - tenor pronunciation.mp3", size: 10 },
      parts,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.suggestion.purpose).toMatchObject({
        value: "pronunciation",
        inferred: true,
      });
      expect(result.suggestion.voiceParts).toMatchObject({
        value: ["t"],
        inferred: true,
      });
      expect(result.suggestion.confidence).toBe("high");
      expect(result.suggestion.filename).toMatchObject({
        value: "Hallelujah - tenor pronunciation.mp3",
        marker: "provided",
      });
    }
  });

  it("never combines All with individual parts", () => {
    const result = classifyAttachment(
      { name: "song ALL soprano.pdf", size: 10 },
      parts,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.suggestion.voiceParts.value).toEqual(["all"]);
  });

  it("allows Other without a label", () => {
    const result = classifyAttachment({ name: "notes.docx", size: 10 }, parts);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.suggestion.purpose.value).toBe("other");
  });

  it("keeps unknown documents valid and rejects executable extensions case-insensitively", () => {
    expect(
      classifyAttachment({ name: "meeting.DOCX", size: 10 }, parts),
    ).toMatchObject({ ok: true });
    expect(
      classifyAttachment({ name: "installer.EXE", size: 10 }, parts),
    ).toMatchObject({ ok: false, reason: "executable" });
  });

  it("infers configured part names and leaves parts empty when none apply", () => {
    const editablePart = classifyAttachment(
      { name: "Mass - alto.mscz", size: 10 },
      parts,
    );
    expect(editablePart.ok).toBe(true);
    if (editablePart.ok)
      expect(editablePart.suggestion).toMatchObject({
        purpose: { value: "editablePartScore" },
        voiceParts: { value: ["a"] },
      });
    const noPart = classifyAttachment({ name: "Mass.mscz", size: 10 }, parts);
    expect(noPart.ok).toBe(true);
    if (noPart.ok) expect(noPart.suggestion.voiceParts.value).toEqual([]);
  });

  it.each([
    ["Song - S.pdf", ["s"]],
    ["Song - A.pdf", ["a"]],
    ["Song - T.mp3", ["t"]],
    ["Song - B.mid", ["b"]],
    ["Song - SATB.pdf", ["all"]],
    ["Song - satb.pdf", ["all"]],
  ] as const)("infers common SATB abbreviation in %s", (name, expected) => {
    const result = classifyAttachment({ name, size: 10 }, parts);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.suggestion.voiceParts.value).toEqual(expected);
  });

  it("infers a part-rehearsal purpose from a voice-part-only audio name", () => {
    const result = classifyAttachment(
      { name: "Hallelujah - Tenor.mp3", size: 10 },
      parts,
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.suggestion).toMatchObject({
        purpose: { value: "partRehearsal" },
        voiceParts: { value: ["t"] },
      });
  });

  it("does not mistake a generic editable source for a part score", () => {
    const result = classifyAttachment(
      { name: "Hallelujah editable.mscz", size: 10 },
      parts,
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.suggestion.purpose.value).toBe("editableFullScore");
  });

  it("infers document-like purposes for safe Other files", () => {
    const result = classifyAttachment(
      { name: "Hallelujah pronunciation.docx", size: 10 },
      parts,
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.suggestion.purpose.value).toBe("pronunciation");
  });
});

describe("purpose choices", () => {
  it("includes pronunciation for document-like, audio, and MIDI formats", () => {
    for (const format of ["pdf", "image", "other", "audio", "midi"] as const) {
      expect(getAllowedPurposes(format)).toContain("pronunciation");
    }
  });

  it("does not offer score-only purposes for audio", () => {
    expect(getAllowedPurposes("audio")).not.toContain("fullScore");
  });
});

describe("standardized names", () => {
  const input = {
    title: "L'été: Sing!",
    arranger: "Zoë O'Neil",
    purpose: "partScore" as AttachmentPurpose,
    voicePartIds: ["b", "all", "s"],
    parts,
    extension: "PDF",
  };

  it("normalizes Unicode/punctuation and uses configured part order", () => {
    expect(generateStandardizedFilename(input)).toBe(
      "Lete-Sing - Zoe-ONeil - Part Score - All.pdf",
    );
    expect(
      generateStandardizedFilename({ ...input, voicePartIds: ["b", "s"] }),
    ).toBe("Lete-Sing - Zoe-ONeil - Part Score - Soprano-Bass.pdf");
  });

  it("omits empty segments and safely normalizes collision comparisons", () => {
    expect(
      generateStandardizedFilename({
        ...input,
        arranger: "",
        voicePartIds: [],
      }),
    ).toBe("Lete-Sing - Part Score.pdf");
    expect(sanitizeFilenameSegment("  résumé / choir?.  ")).toBe(
      "resume-choir",
    );
    expect(filenamesCollide("My Score.PDF", "my_score.pdf")).toBe(true);
    expect(filenamesCollide("My Score.pdf", "My Score.mscz")).toBe(false);
    expect(
      generateStandardizedFilename({ ...input, extension: ".p/d?f" }),
    ).toBe("Lete-Sing - Zoe-ONeil - Part Score - All.pdf");
  });
});

describe("automatic and manual filename state", () => {
  it("follows credit changes until manually overridden, then remains stable", () => {
    const state = createAttachmentNameState({
      title: "Song",
      arranger: "A",
      purpose: "fullScore",
      voicePartIds: ["all"],
      parts,
      extension: "pdf",
    });
    expect(state.filename).toBe("Song - A - Full Score - All.pdf");
    const changed = state.onPieceCreditsChanged({ arranger: "B" });
    expect(changed.filename).toBe("Song - B - Full Score - All.pdf");
    const overridden = changed.override("handout.pdf");
    expect(overridden.filename).toBe("handout.pdf");
    expect(
      overridden.onPieceCreditsChanged({ title: "New Song" }).filename,
    ).toBe("handout.pdf");
  });
});
